package com.aatomhome.guestwelcome;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Opens the guest welcome screen after a full device reboot only.
 * Does not run on SCREEN_ON, hub ADB wake, or routine reconnects.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {
            return;
        }
        Intent launch = new Intent(context, MainActivity.class);
        launch.putExtra("hub_url", "http://192.168.2.1:8080/guest/");
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(launch);
    }
}
