import AVFoundation
import SwiftUI

@main
struct PlanetSongTeacherApp: App {
    init() {
        // Play the teams' songs through the speaker even with the silent switch on
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            WebView()
                .ignoresSafeArea()
                .background(Color(red: 0x08 / 255, green: 0x0B / 255, blue: 0x24 / 255))
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}
