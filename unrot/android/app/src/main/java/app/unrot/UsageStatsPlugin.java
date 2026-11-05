package app.unrot;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONException;

/**
 * Reads the phone's own screen time records (the data behind Digital
 * Wellbeing) once the user turns on Usage access for Unrot.
 *
 * Deliberately thin: it returns raw events, and all the maths (sessions,
 * midnight in the user's time zone, late-night minutes, which app counts as
 * what) happens in TypeScript in src/shared/usage.ts, where it is tested.
 */
@CapacitorPlugin(name = "UsageStats")
public class UsageStatsPlugin extends Plugin {

    /** Event types the TypeScript side understands (see EV in src/shared/usage.ts). */
    private static final int[] WANTED = { 1, 2, 15, 16, 17, 18, 23, 26, 27 };

    /** Never hand back more than this many days of events in one call. */
    private static final long MAX_SPAN_MS = 10L * 24 * 60 * 60 * 1000;

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", hasUsageAccess());
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    /** Opens the system screen where the user switches Usage access on for this app. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.setData(Uri.parse("package:" + ctx.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException e) {
            // Some phones only open the general list.
            Intent fallback = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(fallback);
            } catch (ActivityNotFoundException e2) {
                call.reject("This phone has no Usage access screen.", "NO_SETTINGS");
                return;
            }
        }
        call.resolve();
    }

    /**
     * Raw usage events between start and end (ms since epoch), as
     * { packages: [name, …], events: [[time, type, packageIndex], …] }.
     */
    @PluginMethod
    public void queryEvents(PluginCall call) {
        if (!hasUsageAccess()) {
            call.reject("Usage access is turned off for Unrot.", "NO_ACCESS");
            return;
        }
        Long start = call.getLong("start");
        Long end = call.getLong("end");
        if (start == null || end == null || end <= start) {
            call.reject("Give a start and an end time.", "BAD_RANGE");
            return;
        }
        if (end - start > MAX_SPAN_MS) start = end - MAX_SPAN_MS;

        UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) {
            call.reject("Usage stats are not available on this phone.", "UNAVAILABLE");
            return;
        }
        UsageEvents events = usm.queryEvents(start, end);
        UsageEvents.Event e = new UsageEvents.Event();
        Map<String, Integer> index = new HashMap<>();
        JSArray packages = new JSArray();
        JSArray out = new JSArray();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            if (!wanted(type)) continue;
            String pkg = e.getPackageName() == null ? "" : e.getPackageName();
            Integer i = index.get(pkg);
            if (i == null) {
                i = index.size();
                index.put(pkg, i);
                packages.put(pkg);
            }
            JSArray row = new JSArray();
            row.put(e.getTimeStamp());
            row.put(type);
            row.put(i.intValue());
            out.put(row);
        }
        JSObject r = new JSObject();
        r.put("packages", packages);
        r.put("events", out);
        call.resolve(r);
    }

    /** App names and whether each is a game, for packages the user has installed. */
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void appInfo(PluginCall call) {
        JSArray list = call.getArray("packages", new JSArray());
        PackageManager pm = getContext().getPackageManager();
        JSObject r = new JSObject();
        for (int k = 0; k < list.length(); k++) {
            String pkg;
            try {
                pkg = list.getString(k);
            } catch (JSONException ex) {
                continue;
            }
            try {
                ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                boolean game = (ai.flags & ApplicationInfo.FLAG_IS_GAME) != 0;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && ai.category == ApplicationInfo.CATEGORY_GAME) game = true;
                JSObject o = new JSObject();
                o.put("label", String.valueOf(pm.getApplicationLabel(ai)));
                o.put("game", game);
                o.put("system", (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                r.put(pkg, o);
            } catch (PackageManager.NameNotFoundException ex) {
                // Uninstalled since, or not visible to us: leave it out.
            }
        }
        call.resolve(r);
    }

    private static boolean wanted(int type) {
        for (int w : WANTED) if (w == type) return true;
        return false;
    }

    @SuppressWarnings("deprecation")
    private boolean hasUsageAccess() {
        Context ctx = getContext();
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        if (mode == AppOpsManager.MODE_DEFAULT) {
            return ctx.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED;
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }
}
