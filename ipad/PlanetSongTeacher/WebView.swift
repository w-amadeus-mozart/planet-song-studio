import SwiftUI
import WebKit

/// The view controller currently on screen, for presenting share sheets.
func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene
    var vc = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
    while let presented = vc?.presentedViewController { vc = presented }
    return vc
}

/// Serves the bundled web files (the "web" folder) at planetsong://app/<path>. The teacher screens are at
/// planetsong://app/teacher/index.html. A fixed address keeps the songs added from Files (IndexedDB) and the chosen
/// class between launches; it is a secure context, so audio, the clipboard and storage all work.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "planetsong"
    static let home = URL(string: "planetsong://app/teacher/index.html")!
    private let root = Bundle.main.url(forResource: "web", withExtension: nil)!.standardizedFileURL
    private static let types: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
        "json": "application/json", "svg": "image/svg+xml", "png": "image/png", "mp3": "audio/mpeg",
        "woff2": "font/woff2", "mjs": "text/javascript; charset=utf-8", "txt": "text/plain; charset=utf-8",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if path.isEmpty { path = "teacher/index.html" }
        var file = root.appendingPathComponent(path).standardizedFileURL
        var isFolder: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isFolder), isFolder.boolValue {
            file = file.appendingPathComponent("index.html")
        }
        guard file.path.hasPrefix(root.path + "/"),
              let data = try? Data(contentsOf: file),
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
                  "Content-Type": Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream",
                  "Content-Length": String(data.count),
                  "Access-Control-Allow-Origin": "*",
              ])
        else { return task.didFailWithError(URLError(.fileDoesNotExist)) }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

struct WebView: UIViewRepresentable {
    static let night = UIColor(red: 0x08 / 255, green: 0x0B / 255, blue: 0x24 / 255, alpha: 1)

    /// Saving a song or the class medley clicks a link to a blob; on the iPad that goes to the share sheet
    /// (Save to Files, AirDrop, Mail) instead. Same bridge as Music Class.
    static let bridge = """
    (() => {
      const post = (name, body) => { try { window.webkit.messageHandlers[name].postMessage(body); return true; } catch (e) { return false; } };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        const href = this.href || '', name = this.download;
        if (!name || !/^(blob|data):/.test(href)) return click.call(this);
        fetch(href).then(r => r.blob()).then(blob => new Promise((resolve, reject) => {
          const fr = new FileReader(); fr.onload = () => resolve([fr.result, blob.type]); fr.onerror = reject; fr.readAsDataURL(blob);
        })).then(([url, mime]) => post('saveFile', { name, mime, base64: String(url).split(',')[1] || '' })).catch(() => {});
      };
    })();
    """

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.userContentController.addUserScript(WKUserScript(source: Self.bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(SaveFileHandler(presenter: topViewController), name: "saveFile")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = Self.night
        webView.scrollView.backgroundColor = Self.night
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        webView.navigationDelegate = context.coordinator
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        webView.load(URLRequest(url: BundleSchemeHandler.home))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate {
        // Stay inside the app; an ordinary web link opens in Safari.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
            if url.scheme == BundleSchemeHandler.scheme || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
                return decisionHandler(.allow)
            }
            if url.scheme == "https" || url.scheme == "http" { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }

        // If the web content process is ever killed (low memory), reload rather than show a blank screen.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
    }
}
