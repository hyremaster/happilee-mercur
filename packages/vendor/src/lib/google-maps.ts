const CALLBACK_NAME = "__googleMapsReady"

let loadPromise: Promise<typeof google.maps> | null = null

/**
 * Loads the Google Maps JS API once and shares the result between the map
 * and the geocoding calls. A failed load resets the cache so a later attempt
 * (e.g. reopening the modal) can retry.
 */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window !== "undefined" && window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps)
  }
  if (loadPromise) {
    return loadPromise
  }

  const apiKey = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is not configured"))
  }

  loadPromise = new Promise<typeof google.maps>((resolve, reject) => {
    const fail = (message: string) => {
      loadPromise = null
      document.getElementById("google-maps-script")?.remove()
      reject(new Error(message))
    }

    const globals = window as unknown as Record<string, unknown>
    globals[CALLBACK_NAME] = () => resolve(window.google.maps)
    // Google calls this when the key is invalid, restricted for this
    // domain, or billing is not enabled.
    globals.gm_authFailure = () => fail("Google Maps rejected the API key")

    const script = document.createElement("script")
    script.id = "google-maps-script"
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&v=weekly&callback=${CALLBACK_NAME}`
    script.onerror = () => fail("Could not load Google Maps")
    document.head.appendChild(script)
  })

  return loadPromise
}
