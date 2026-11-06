package app.unrot;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saves and opens backup files through Android's own file screens (the
 * Storage Access Framework): the person picks where a backup goes, Google
 * Drive included, and which file to restore. No storage permission needed.
 *
 * Only moves text: what a backup contains, and checking it, is done in
 * TypeScript (src/client/lib/backup.ts).
 */
@CapacitorPlugin(name = "Backup")
public class BackupPlugin extends Plugin {

    /** Backups are a few hundred KB; anything this big is not one. */
    private static final int MAX_BYTES = 32 * 1024 * 1024;

    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("data") == null) {
            call.reject("Nothing to save.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "unrot-backup.json"));
        try {
            startActivityForResult(call, intent, "saveResult");
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no screen for saving files.");
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            Uri uri = pickedUri(result);
            JSObject r = new JSObject();
            if (uri == null) {
                r.put("saved", false);
                call.resolve(r);
                return;
            }
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (out == null) throw new IOException("the file could not be opened");
                out.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
            }
            r.put("saved", true);
            r.put("name", displayName(uri));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not save the backup: " + e.getMessage());
        } finally {
            getBridge().releaseCall(call);
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // Drive and Downloads label JSON files inconsistently: allow any file, the app checks it.
        intent.setType("*/*");
        try {
            startActivityForResult(call, intent, "openResult");
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no screen for opening files.");
        }
    }

    @ActivityCallback
    private void openResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            Uri uri = pickedUri(result);
            JSObject r = new JSObject();
            if (uri == null) {
                r.put("opened", false);
                call.resolve(r);
                return;
            }
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IOException("the file could not be opened");
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[64 * 1024];
                int n;
                while ((n = in.read(chunk)) != -1) {
                    buf.write(chunk, 0, n);
                    if (buf.size() > MAX_BYTES) throw new IOException("it is too big to be an Unrot backup");
                }
                r.put("opened", true);
                r.put("name", displayName(uri));
                r.put("data", new String(buf.toByteArray(), StandardCharsets.UTF_8));
            }
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not open that file: " + e.getMessage());
        } finally {
            getBridge().releaseCall(call);
        }
    }

    private static Uri pickedUri(ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK) return null;
        Intent data = result.getData();
        return data == null ? null : data.getData();
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // The name is only shown to the person; the file itself was fine.
        }
        return uri.getLastPathSegment();
    }
}
