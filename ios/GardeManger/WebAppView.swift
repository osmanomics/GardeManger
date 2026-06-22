import SwiftUI
import WebKit

struct WebAppView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: "gardeScan")
        configuration.userContentController.add(context.coordinator, name: "gardeRecipes")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.webView = webView
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        loadApp(into: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    private func loadApp(into webView: WKWebView) {
        if let remoteURL = configuredRemoteURL() {
            webView.load(URLRequest(url: remoteURL))
            return
        }

        guard
            let webDirectory = Bundle.main.url(forResource: "Web", withExtension: nil),
            let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web")
        else {
            webView.loadHTMLString("<h1>Garde-Manger</h1><p>Bundled app files were not found.</p>", baseURL: nil)
            return
        }

        webView.loadFileURL(indexURL, allowingReadAccessTo: webDirectory)
    }

    private func configuredRemoteURL() -> URL? {
        guard
            let rawValue = Bundle.main.object(forInfoDictionaryKey: "GardeWebURL") as? String,
            !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !rawValue.contains("$("),
            let url = URL(string: rawValue),
            let scheme = url.scheme?.lowercased(),
            ["https", "http"].contains(scheme)
        else {
            return nil
        }

        return url
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else {
                return
            }

            switch message.name {
            case "gardeScan":
                handleScan(body)
            case "gardeRecipes":
                handleRecipes(body)
            default:
                return
            }
        }

        private func handleScan(_ body: [String: Any]) {
            guard
                let requestId = body["requestId"] as? String,
                let image = body["image"] as? String
            else {
                return
            }

            Task {
                do {
                    let result = try await OpenAIIngredientScanner.fromBundle().scan(imageDataURL: image)
                    completeScan(requestId: requestId, result: result)
                } catch {
                    completeScan(requestId: requestId, error: error.localizedDescription)
                }
            }
        }

        private func handleRecipes(_ body: [String: Any]) {
            guard
                let requestId = body["requestId"] as? String,
                let ingredients = body["ingredients"] as? [String]
            else {
                return
            }

            let rawPreferences = body["preferences"] as? [String: Any] ?? [:]
            let preferences = OpenAIIngredientScanner.RecipePreferences(
                staples: rawPreferences["staples"] as? Bool ?? true,
                vegetarian: rawPreferences["vegetarian"] as? Bool ?? false,
                fast: rawPreferences["fast"] as? Bool ?? false
            )

            Task {
                do {
                    let result = try await OpenAIIngredientScanner.fromBundle().recipes(
                        ingredients: ingredients,
                        preferences: preferences
                    )
                    completeRecipes(requestId: requestId, result: result)
                } catch {
                    completeRecipes(requestId: requestId, error: error.localizedDescription)
                }
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showLoadError(error, in: webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showLoadError(error, in: webView)
        }

        private func showLoadError(_ error: Error, in webView: WKWebView) {
            let message = error.localizedDescription
                .replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
            let html = """
            <main style="font: -apple-system-body; padding: 24px;">
              <h1>Garde-Manger</h1>
              <p>The app could not load.</p>
              <p style="color: #65706a;">\(message)</p>
            </main>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }

        @MainActor
        private func completeScan(requestId: String?, result: OpenAIIngredientScanner.ScanResponse) {
            guard let requestId else {
                return
            }

            do {
                let idJSON = try jsonString(for: requestId)
                let payloadJSON = try jsonString(for: result)
                webView?.evaluateJavaScript("window.gardeNativeScanComplete(\(idJSON), \(payloadJSON));")
            } catch {
                completeScan(requestId: requestId, error: error.localizedDescription)
            }
        }

        @MainActor
        private func completeScan(requestId: String?, error: String) {
            guard let requestId else {
                return
            }

            let payload = NativeScanError(error: error)
            guard
                let idJSON = try? jsonString(for: requestId),
                let payloadJSON = try? jsonString(for: payload)
            else {
                return
            }

            webView?.evaluateJavaScript("window.gardeNativeScanComplete(\(idJSON), \(payloadJSON));")
        }

        @MainActor
        private func completeRecipes(requestId: String?, result: OpenAIIngredientScanner.RecipeResponse) {
            guard let requestId else {
                return
            }

            do {
                let idJSON = try jsonString(for: requestId)
                let payloadJSON = try jsonString(for: result)
                webView?.evaluateJavaScript("window.gardeNativeRecipesComplete(\(idJSON), \(payloadJSON));")
            } catch {
                completeRecipes(requestId: requestId, error: error.localizedDescription)
            }
        }

        @MainActor
        private func completeRecipes(requestId: String?, error: String) {
            guard let requestId else {
                return
            }

            let payload = NativeScanError(error: error)
            guard
                let idJSON = try? jsonString(for: requestId),
                let payloadJSON = try? jsonString(for: payload)
            else {
                return
            }

            webView?.evaluateJavaScript("window.gardeNativeRecipesComplete(\(idJSON), \(payloadJSON));")
        }

        private func jsonString<T: Encodable>(for value: T) throws -> String {
            let data = try JSONEncoder().encode(value)
            return String(decoding: data, as: UTF8.self)
        }
    }

    private struct NativeScanError: Encodable {
        let error: String
    }
}
