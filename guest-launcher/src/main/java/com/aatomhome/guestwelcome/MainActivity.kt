package com.aatomhome.guestwelcome

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.app.Activity

/**
 * Guest Welcome — WebView shell that loads the hub onboard page (room code + hub URL).
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var hubConfig: HubConfig

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyImmersiveFullscreen()
        hubConfig = HubConfig(this)

        intent?.getStringExtra("hub_url")?.let { applyHubUrlExtra(it) }

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
        }

        webView.setInitialScale(100)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.setBackgroundColor(0xFF0C1222.toInt())

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(GuestLauncherBridge(this, hubConfig), "GuestLauncher")

        startService(Intent(this, TvAgentService::class.java))

        loadStartPage()
    }

    private fun applyHubUrlExtra(raw: String) {
        val trimmed = raw.trim()
        val base = trimmed
            .removeSuffix("/guest/onboard/")
            .removeSuffix("/guest/onboard")
            .removeSuffix("/guest/")
            .removeSuffix("/guest")
            .trimEnd('/')
        if (base.isNotEmpty()) {
            hubConfig.applyHubUrl(hubConfig.activeProfileId, base)
        }
    }

    private fun onboardUrl(): String {
        val base = hubConfig.hubBaseUrl().ifBlank { DEFAULT_HUB_BASE }
        return "$base/guest/onboard/"
    }

    /**
     * Default to the guest dashboard (HA or STR). Guest JS syncs hub claim + session silently.
     * Only open onboard when an intent explicitly targets /guest/onboard/ (fresh setup).
     */
    private fun startPageUrl(): String {
        val fromIntent = intent?.getStringExtra("hub_url")?.trim()
        if (!fromIntent.isNullOrBlank() && fromIntent.contains("/guest/onboard")) {
            return fromIntent
        }
        return hubConfig.guestUrl()
    }

    private fun loadStartPage() {
        webView.loadUrl(startPageUrl())
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveFullscreen()
    }

    @Suppress("DEPRECATION")
    private fun applyImmersiveFullscreen() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra("hub_url")?.let {
            applyHubUrlExtra(it)
            if (::webView.isInitialized) loadStartPage()
        }
    }

    override fun onResume() {
        super.onResume()
        applyImmersiveFullscreen()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (::webView.isInitialized && keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        const val DEFAULT_HUB_BASE = "http://172.16.1.36:18080"
    }
}
