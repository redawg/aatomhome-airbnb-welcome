package com.cielodeloro.guestwelcome;

import android.accessibilityservice.AccessibilityService;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Returns guests to the welcome screen after they leave a streaming app for the
 * Google TV home row. Ignores transient launcher overlays while an app is still
 * in the foreground.
 */
public class WelcomeAccessibilityService extends AccessibilityService {
    private static final String GOOGLE_TV = "com.google.android.apps.tv.launcherx";
    private static final String WELCOME_PKG = "com.cielodeloro.guestwelcome";
    private static final long RETURN_DELAY_MS = 8000L;

    private static final Set<String> IGNORABLE = new HashSet<>(Arrays.asList(
            "com.android.systemui",
            "android",
            "com.google.android.tvrecommendations",
            "com.google.android.katniss",
            "com.google.android.gms",
            "com.google.android.gsf"
    ));

    static String lastPackage;
    private static Handler returnHandler;
    private static Runnable returnRunnable;

    private void cancelReturn() {
        if (returnHandler != null && returnRunnable != null) {
            returnHandler.removeCallbacks(returnRunnable);
        }
    }

    private void ensureHandler() {
        if (returnHandler == null) {
            returnHandler = new Handler(Looper.getMainLooper());
        }
        if (returnRunnable == null) {
            returnRunnable = new ReturnRunnable(this);
        }
    }

    private boolean isIgnorable(String packageName) {
        return packageName != null && IGNORABLE.contains(packageName);
    }

    private static boolean isAppStillForeground(Context context, String packageName) {
        if (packageName == null || packageName.isEmpty()) {
            return false;
        }
        ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
        if (processes == null) {
            return false;
        }
        for (ActivityManager.RunningAppProcessInfo info : processes) {
            // Video apps (e.g. Paramount+) are often IMPORTANCE_VISIBLE (200), not FOREGROUND (100).
            if (info.importance > ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE) {
                continue;
            }
            String processName = info.processName;
            if (processName == null) {
                continue;
            }
            if (processName.equals(packageName) || processName.startsWith(packageName + ":")) {
                return true;
            }
        }
        return false;
    }

    private void scheduleReturn() {
        ensureHandler();
        cancelReturn();
        returnHandler.postDelayed(returnRunnable, RETURN_DELAY_MS);
    }

    private boolean shouldReturnFrom(String packageName) {
        if (packageName == null || packageName.isEmpty()) {
            return false;
        }
        if (WELCOME_PKG.equals(packageName) || GOOGLE_TV.equals(packageName)) {
            return false;
        }
        return !isIgnorable(packageName);
    }

    public void launchWelcome() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            return;
        }
        CharSequence pkg = event.getPackageName();
        if (pkg == null) {
            return;
        }
        String packageName = pkg.toString();

        if (WELCOME_PKG.equals(packageName)) {
            cancelReturn();
            lastPackage = packageName;
            return;
        }

        if (GOOGLE_TV.equals(packageName)) {
            if (shouldReturnFrom(lastPackage)
                    && !isAppStillForeground(this, lastPackage)) {
                scheduleReturn();
            }
            lastPackage = packageName;
            return;
        }

        cancelReturn();
        lastPackage = packageName;
    }

    @Override
    public void onInterrupt() {
        cancelReturn();
    }

    private static final class ReturnRunnable implements Runnable {
        private final WelcomeAccessibilityService service;

        ReturnRunnable(WelcomeAccessibilityService service) {
            this.service = service;
        }

        @Override
        public void run() {
            if (isAppStillForeground(service, lastPackage)) {
                return;
            }
            service.launchWelcome();
        }
    }
}
