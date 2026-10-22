import UIKit
import WebKit

/// Hands a file the page wants to save (a song or the class medley) to the iPad
/// share sheet: Save to Files, AirDrop, Mail. The page side is in WebView.bridge:
/// window.webkit.messageHandlers.saveFile.postMessage({ name, base64, mime }).
final class SaveFileHandler: NSObject, WKScriptMessageHandler {
    private let presenterProvider: () -> UIViewController?

    init(presenter: @escaping () -> UIViewController?) {
        self.presenterProvider = presenter
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard
            let body = message.body as? [String: Any],
            let name = body["name"] as? String,
            let base64 = body["base64"] as? String,
            let data = Data(base64Encoded: base64),
            let presenter = presenterProvider()
        else { return }
        let safeName = name.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return
        }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let pop = sheet.popoverPresentationController {
            // iPad needs an anchor for the share sheet: the middle of the screen
            pop.sourceView = presenter.view
            pop.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        presenter.present(sheet, animated: true)
    }
}
