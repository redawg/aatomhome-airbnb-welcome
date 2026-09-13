package com.cielodeloro.guestwelcome

import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Polls every claimed hub profile for guest commands.
 */
class TvAgentService : Service() {
    private val running = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor()
    private var profileIds: List<String> = emptyList()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        profileIds = intent?.getStringArrayExtra(EXTRA_PROFILE_IDS)?.toList()
            ?: HubConfig(this).claimedProfileIds()
        if (running.compareAndSet(false, true)) {
            executor.execute { runAgentLoop() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running.set(false)
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun runAgentLoop() {
        val config = HubConfig(this)
        while (running.get()) {
            try {
                val targets = profileIds.ifEmpty { config.claimedProfileIds() }
                if (targets.isEmpty()) {
                    Thread.sleep(5000)
                    continue
                }
                for (profileId in targets) {
                    if (!config.isClaimed(profileId)) continue
                    pollOnce(config, profileId)
                }
            } catch (interrupted: InterruptedException) {
                break
            } catch (err: Exception) {
                Log.w(TAG, "agent loop: ${err.message}")
            }
            Thread.sleep(2000)
        }
    }

    private fun pollOnce(config: HubConfig, profileId: String) {
        val deviceId = config.deviceId(profileId)
        if (deviceId < 0) return
        val base = config.hubBaseUrl(profileId)
        val pollUrl = "$base/api/tv-agent/$deviceId/poll"
        val body = JSONObject()
        body.put("device_fingerprint", deviceFingerprint())
        body.put("local_ip", localIpv4())
        body.put("profile_id", profileId)
        val response = httpPost(pollUrl, body.toString()) ?: return
        val json = JSONObject(response)
        if (!json.optBoolean("ok", false)) return
        if (json.isNull("command")) return
        val command = json.optString("command")
        val result = executeCommand(command, config, profileId)
        val resultUrl = "$base/api/tv-agent/$deviceId/result"
        httpPost(resultUrl, result.toString())
    }

    private fun executeCommand(command: String, config: HubConfig, profileId: String): JSONObject {
        val result = JSONObject()
        result.put("command", command)
        result.put("profile_id", profileId)
        when (command) {
            "clear_streaming_logins" -> {
                val cleared = clearStreamingPackages(DEFAULT_STREAMING_PACKAGES)
                result.put("ok", true)
                result.put("cleared", cleared.joinToString(","))
            }
            "report_status" -> {
                result.put("ok", true)
                result.put("device_id", config.deviceId(profileId))
                result.put("local_ip", localIpv4())
                result.put("model", Build.MODEL)
                result.put("hub", config.hubBaseUrl(profileId))
            }
            else -> {
                result.put("ok", false)
                result.put("error", "unknown_command")
            }
        }
        return result
    }

    private fun httpPost(url: String, jsonBody: String): String? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 25000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        return try {
            OutputStreamWriter(conn.outputStream).use { it.write(jsonBody) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            BufferedReader(InputStreamReader(stream)).use { it.readText() }
        } catch (err: Exception) {
            Log.w(TAG, "http post failed: ${err.message}")
            null
        } finally {
            conn.disconnect()
        }
    }

    private fun clearStreamingPackages(packages: List<String>): List<String> {
        val cleared = mutableListOf<String>()
        for (pkg in packages) {
            try {
                val proc = Runtime.getRuntime().exec(arrayOf("pm", "clear", pkg))
                proc.waitFor()
                if (proc.exitValue() == 0) cleared.add(pkg)
            } catch (_: Exception) {
            }
        }
        return cleared
    }

    private fun localIpv4(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        return addr.hostAddress ?: ""
                    }
                }
            }
        } catch (_: Exception) {
        }
        return ""
    }

    private fun deviceFingerprint(): String {
        return Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: Build.MODEL
    }

    companion object {
        const val EXTRA_PROFILE_IDS = "profile_ids"
        private const val TAG = "TvAgentService"
        val DEFAULT_STREAMING_PACKAGES = listOf(
            "com.netflix.ninja",
            "com.amazon.amazonvideo.livingroom",
            "com.disney.disneyplus",
            "com.hulu.livingroomplus",
        )
    }
}
