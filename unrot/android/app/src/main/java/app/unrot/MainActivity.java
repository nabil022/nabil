package app.unrot;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-specific plugins must be registered before the bridge starts.
        registerPlugin(UsageStatsPlugin.class);
        registerPlugin(BackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
