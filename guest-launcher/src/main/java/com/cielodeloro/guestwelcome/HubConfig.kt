package com.cielodeloro.guestwelcome

import android.content.Context
import android.content.SharedPreferences

/**
 * Per-profile hub state — supports dual-backend testing (Forest LAN vs infra3 fleet).
 */
data class HubProfile(
    val id: String,
    val label: String,
    val defaultBaseUrl: String,
)

/** Persists hub URL, claim state, and device id per profile. */
class HubConfig(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    val profiles: List<HubProfile> = BUILTIN_PROFILES

    var activeProfileId: String
        get() = prefs.getString(KEY_ACTIVE_PROFILE, PROFILE_FOREST_LAN) ?: PROFILE_FOREST_LAN
        set(value) = prefs.edit().putString(KEY_ACTIVE_PROFILE, value).apply()

    val activeProfile: HubProfile
        get() = profiles.firstOrNull { it.id == activeProfileId } ?: profiles.first()

    fun hubBaseUrl(profileId: String = activeProfileId): String {
        val key = keyFor(profileId, KEY_HUB_URL_SUFFIX)
        val fallback = profiles.firstOrNull { it.id == profileId }?.defaultBaseUrl ?: DEFAULT_HUB_BASE
        return prefs.getString(key, fallback)?.trimEnd('/') ?: fallback
    }

    fun setHubBaseUrl(profileId: String, url: String) {
        val trimmed = url.trim().removeSuffix("/").removeSuffix("/guest")
        prefs.edit().putString(keyFor(profileId, KEY_HUB_URL_SUFFIX), trimmed).apply()
        prefs.edit().putString(
            keyFor(profileId, KEY_GUEST_URL_SUFFIX),
            if (trimmed.endsWith("/guest")) "$trimmed/" else "$trimmed/guest/",
        ).apply()
    }

    fun guestUrl(profileId: String = activeProfileId): String {
        val stored = prefs.getString(keyFor(profileId, KEY_GUEST_URL_SUFFIX), null)
        if (!stored.isNullOrBlank()) return stored
        return "${hubBaseUrl(profileId)}/guest/"
    }

    fun deviceId(profileId: String = activeProfileId): Int =
        prefs.getInt(keyFor(profileId, KEY_DEVICE_ID_SUFFIX), -1)

    fun setDeviceId(profileId: String, deviceId: Int) =
        prefs.edit().putInt(keyFor(profileId, KEY_DEVICE_ID_SUFFIX), deviceId).apply()

    fun claimCode(profileId: String = activeProfileId): String? =
        prefs.getString(keyFor(profileId, KEY_CLAIM_CODE_SUFFIX), null)

    fun setClaimCode(profileId: String, code: String?) =
        prefs.edit().putString(keyFor(profileId, KEY_CLAIM_CODE_SUFFIX), code).apply()

    fun isClaimed(profileId: String = activeProfileId): Boolean =
        prefs.getBoolean(keyFor(profileId, KEY_CLAIMED_SUFFIX), false)

    fun setClaimed(profileId: String, claimed: Boolean) =
        prefs.edit().putBoolean(keyFor(profileId, KEY_CLAIMED_SUFFIX), claimed).apply()

    /** Any profile claimed — show welcome using active profile if claimed, else claim UI. */
    fun hasAnyClaimedProfile(): Boolean = profiles.any { isClaimed(it.id) }

    fun claimedProfileIds(): List<String> = profiles.filter { isClaimed(it.id) }.map { it.id }

    fun applyHubUrl(profileId: String, url: String) = setHubBaseUrl(profileId, url)

    fun markClaimed(profileId: String, deviceId: Int, hubUrl: String?) {
        setDeviceId(profileId, deviceId)
        setClaimed(profileId, true)
        activeProfileId = profileId
        if (!hubUrl.isNullOrBlank()) applyHubUrl(profileId, hubUrl)
    }

    // Legacy single-hub accessors (active profile)
    var hubBaseUrl: String
        get() = hubBaseUrl(activeProfileId)
        set(value) = setHubBaseUrl(activeProfileId, value)

    var guestUrl: String
        get() = guestUrl(activeProfileId)
        set(value) = prefs.edit().putString(keyFor(activeProfileId, KEY_GUEST_URL_SUFFIX), value).apply()

    var deviceId: Int
        get() = deviceId(activeProfileId)
        set(value) = setDeviceId(activeProfileId, value)

    var claimCode: String?
        get() = claimCode(activeProfileId)
        set(value) = setClaimCode(activeProfileId, value)

    var claimed: Boolean
        get() = isClaimed(activeProfileId)
        set(value) = setClaimed(activeProfileId, value)

    private fun keyFor(profileId: String, suffix: String): String = "${profileId}_$suffix"

    companion object {
        const val PREFS_NAME = "aatomhome_hub"
        const val DEFAULT_HUB_BASE = "http://172.18.1.137:8080"

        const val PROFILE_FOREST_LAN = "forest-lan"
        const val PROFILE_INFRA3 = "infra3"

        val BUILTIN_PROFILES = listOf(
            HubProfile(
                PROFILE_FOREST_LAN,
                "Forest hub (HA LAN / cross-VLAN)",
                "http://172.16.255.250:8080",
            ),
            HubProfile(
                PROFILE_INFRA3,
                "Infra3 hub (fleet / same-VLAN test)",
                "http://172.16.1.36:8080",
            ),
        )

        private const val KEY_ACTIVE_PROFILE = "active_profile"
        private const val KEY_HUB_URL_SUFFIX = "hub_url"
        private const val KEY_GUEST_URL_SUFFIX = "guest_url"
        private const val KEY_DEVICE_ID_SUFFIX = "device_id"
        private const val KEY_CLAIM_CODE_SUFFIX = "claim_code"
        private const val KEY_CLAIMED_SUFFIX = "claimed"
    }
}
