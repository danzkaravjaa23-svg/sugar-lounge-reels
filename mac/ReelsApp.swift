// Sugar Lounge Reels — вэб аппыг (index.html, js/, css/) өөрийн цонхонд ажиллуулдаг Mac програм.
// Файлуудыг bundle-ийн Resources/web-ээс reels://app/ хаягаар үйлчилнэ:
// file:// дээр ES module ачаалагддаггүй тул өөрийн scheme хэрэгтэй.
//
// Бүтээх: scripts/build-mac-app.sh
// Өөрийгөө шалгах: SugarLoungeReels --selftest <fixtures-dir> <out-dir>

import AppKit
import UniformTypeIdentifiers
import WebKit

let appScheme = "reels"
let startURL = URL(string: "reels://app/index.html")!
let darkBackground = NSColor(srgbRed: 0x0e / 255, green: 0x08 / 255, blue: 0x0d / 255, alpha: 1)

// MARK: - Файл үйлчлэгч

@MainActor
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
  private let roots: [String: URL] // "" = үндсэн, бусад нь эхний хавтсаар ("__fixtures")

  init(root: URL, extra: [String: URL] = [:]) {
    var roots = extra
    roots[""] = root
    self.roots = roots.mapValues { $0.standardizedFileURL }
  }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else {
      task.didFailWithError(URLError(.badURL))
      return
    }
    var rel = String(url.path.drop(while: { $0 == "/" }))
    if rel.isEmpty { rel = "index.html" }

    var base = roots[""]!
    if let first = rel.split(separator: "/").first, let extra = roots[String(first)] {
      base = extra
      rel = String(rel.dropFirst(first.count + 1))
    }
    let file = base.appendingPathComponent(rel).standardizedFileURL

    // Үндсэн хавтаснаас гадагш (../) гарахыг хориглоно
    guard file.path.hasPrefix(base.path + "/"), let data = try? Data(contentsOf: file) else {
      respond(task, url: url, status: 404, type: "text/plain; charset=utf-8", data: Data("Not found".utf8))
      return
    }
    respond(task, url: url, status: 200, type: mimeType(for: file.pathExtension), data: data)
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
    // Хариу шууд илгээгддэг тул цуцлах зүйл алга
  }

  private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
    let headers = [
      "Content-Type": type,
      "Content-Length": String(data.count),
      "Cache-Control": "no-cache",
    ]
    let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    task.didReceive(response)
    task.didReceive(data)
    task.didFinish()
  }

  private func mimeType(for ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json"
    case "webmanifest": return "application/manifest+json"
    case "svg": return "image/svg+xml"
    default: return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }
  }
}

// MARK: - Цонхгүй горимууд: --selftest (өөрийгөө шалгах) ба --render (хавтаснаас reel гаргах)
//
//   SugarLoungeReels --selftest <fixtures-dir> <out-dir>
//   SugarLoungeReels --render <clips-dir> <out-dir> [preset] [name]
//     clips-dir: mp4/mov/jpg/png клипүүд (нэрийн дарааллаар) + нэг хөгжим (wav/mp3/m4a) байж болно
//     preset: vibe | cocktail | ktv | story (анхдагч vibe); name: гаралтын файлын нэр (.mp4-гүй)

struct SelfTest {
  enum Mode { case selftest, render }
  let mode: Mode
  let fixtures: URL
  let outDir: URL
  let preset: String
  let outName: String?

  static func parse(_ args: [String]) -> SelfTest? {
    if let i = args.firstIndex(of: "--selftest"), args.count > i + 2 {
      return SelfTest(mode: .selftest, fixtures: URL(fileURLWithPath: args[i + 1]), outDir: URL(fileURLWithPath: args[i + 2]),
                      preset: "vibe", outName: nil)
    }
    if let i = args.firstIndex(of: "--render"), args.count > i + 2 {
      let preset = args.count > i + 3 ? args[i + 3] : "vibe"
      let name = args.count > i + 4 ? args[i + 4] : nil
      return SelfTest(mode: .render, fixtures: URL(fileURLWithPath: args[i + 1]), outDir: URL(fileURLWithPath: args[i + 2]),
                      preset: preset, outName: name)
    }
    return nil
  }

  var timeoutSeconds: Double { mode == .render ? 900 : 150 }

  // Хавтасны файлууд: клипүүд нэрийн дарааллаар, хөгжим тусдаа
  var fileList: [[String: String]] {
    let names = ((try? FileManager.default.contentsOfDirectory(atPath: fixtures.path)) ?? []).sorted()
    let video = ["mp4", "mov", "m4v", "webm"], image = ["jpg", "jpeg", "png", "heic", "webp"], audio = ["wav", "mp3", "m4a", "aac", "aiff"]
    return names.compactMap { n in
      let ext = (n as NSString).pathExtension.lowercased()
      if video.contains(ext) { return ["name": n, "kind": "video", "type": "video/\(ext == "mov" ? "quicktime" : ext)"] }
      if image.contains(ext) { return ["name": n, "kind": "image", "type": "image/\(ext == "jpg" ? "jpeg" : ext)"] }
      if audio.contains(ext) { return ["name": n, "kind": "audio", "type": "audio/\(ext == "mp3" ? "mpeg" : ext)"] }
      return nil
    }
  }

  // Файлуудыг нэмж, хөгжмийг beat-д тааруулж, видео гаргана. Хадгалахыг native тал удирдана.
  var script: String {
    let files: [[String: String]]
    if mode == .selftest {
      files = [["name": "vid-a.mp4", "kind": "video", "type": "video/mp4"], ["name": "photo1.jpg", "kind": "image", "type": "image/jpeg"],
               ["name": "vid-b.mp4", "kind": "video", "type": "video/mp4"], ["name": "photo2.jpg", "kind": "image", "type": "image/jpeg"],
               ["name": "beat-124.wav", "kind": "audio", "type": "audio/wav"]]
    } else {
      files = fileList
    }
    let filesJSON = String(data: try! JSONSerialization.data(withJSONObject: files), encoding: .utf8)!
    let presetJSON = String(data: try! JSONSerialization.data(withJSONObject: [preset]), encoding: .utf8)!
    return Self.scriptTemplate.replacingOccurrences(of: "__FILES__", with: filesJSON)
      .replacingOccurrences(of: "__PRESET__", with: presetJSON)
  }

  static let scriptTemplate = """
  (async () => {
    const report = (o) => window.webkit.messageHandlers.reels.postMessage(JSON.stringify(o));
    try {
      for (let i = 0; i < 100 && !window.__reels; i++) await new Promise((r) => setTimeout(r, 100));
      const R = window.__reels;
      if (!R) throw new Error('window.__reels алга — main.js ачаалагдсангүй');
      const preset = __PRESET__[0];
      if (R.recipe.preset !== preset) {
        const sel = document.getElementById('preset');
        if (![...sel.options].some((o) => o.value === preset)) throw new Error('загвар олдсонгүй: ' + preset);
        sel.value = preset;
        sel.dispatchEvent(new Event('change'));
      }
      const all = __FILES__;
      const load = async (f) => {
        const res = await fetch('/__fixtures/' + encodeURIComponent(f.name));
        if (!res.ok) throw new Error('файл ' + f.name + ': ' + res.status);
        return new File([await res.blob()], f.name, { type: f.type });
      };
      const clips = await Promise.all(all.filter((f) => f.kind !== 'audio').map(load));
      if (!clips.length) throw new Error('хавтсанд бичлэг/зураг алга');
      await R.addFiles(clips);
      // Хөгжим + BPM илрүүлэлт (WebKit-ийн OfflineAudioContext) — cut-ууд beat дээр буух ёстой
      const music = all.find((f) => f.kind === 'audio');
      let beats = null;
      if (music) {
        await R.audio.loadFile(await load(music));
        const { detectBeats } = await import('/js/beats.js');
        R.state.beats = await detectBeats(R.audio.buffer, R.recipe.beatSync);
        R.refresh();
        await R.syncMusicOffset();
        beats = R.state.beats && { bpm: R.state.beats.bpm, offset: R.state.beats.offset, confidence: R.state.beats.confidence };
      }
      const caps = {
        preset: R.recipe.preset,
        clips: R.state.assets.map((a) => a.name),
        beats,
        bars: R.state.timeline.grid ? R.state.timeline.duration / R.state.timeline.grid.bar : null,
        mediaRecorder: typeof MediaRecorder,
        captureStream: typeof HTMLCanvasElement.prototype.captureStream,
        mp4: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4'),
        canvasFilter: typeof document.createElement('canvas').getContext('2d').filter,
        coarsePointer: matchMedia('(pointer: coarse)').matches,
      };
      document.getElementById('exportBtn').click();
      for (let i = 0; i < 2400 && !R.state.result; i++) await new Promise((r) => setTimeout(r, 250));
      if (!R.state.result) throw new Error('экспорт дуусаагүй: ' + document.getElementById('toast').textContent);
      const v = document.getElementById('resultVideo');
      if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 5000); });
      report({
        step: 'exported', caps,
        assets: R.state.assets.length,
        timeline: R.state.timeline.duration,
        type: R.state.result.blob.type,
        size: R.state.result.blob.size,
        name: R.state.result.name,
        videoDuration: v.duration, width: v.videoWidth, height: v.videoHeight,
      });
    } catch (e) {
      report({ step: 'error', message: String((e && e.stack) || e) });
    }
  })();
  """
}

// JS-ийн алдааг native тал руу дамжуулна (Console.app болон selftest-д харагдана)
let errorHookScript = """
window.addEventListener('error', (e) => window.webkit.messageHandlers.reels.postMessage(
  JSON.stringify({ step: 'jserror', message: String(e.message), at: e.filename + ':' + e.lineno })));
window.addEventListener('unhandledrejection', (e) => window.webkit.messageHandlers.reels.postMessage(
  JSON.stringify({ step: 'jserror', message: String((e.reason && e.reason.stack) || e.reason) })));
"""

// MARK: - Вэб харагдац

// Баруун товчны "Reload" нь бүх бичлэгийг асуулгүй арилгадаг тул хасна (⌘R асуудаг)
final class ReelsWebView: WKWebView {
  override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
    for item in menu.items where item.identifier?.rawValue == "WKMenuItemIdentifierReload" {
      menu.removeItem(item)
    }
    super.willOpenMenu(menu, with: event)
  }
}

// MARK: - Програм

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate,
  WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler
{
  private let selfTest: SelfTest?
  private var window: NSWindow!
  private var webView: WKWebView!
  private var downloads: [ObjectIdentifier: URL] = [:]
  private var selfTestReport: [String: Any] = [:]
  private var jsErrors: [String] = []
  private var crashTimes: [Date] = []
  private var pendingQuit: String?   // гарахад алдагдах ажил (экспорт, хадгалаагүй видео)
  private var pendingReload: String? // дахин ачаалахад алдагдах ажил (дээрх + нэмсэн бичлэг)

  init(selfTest: SelfTest?) {
    self.selfTest = selfTest
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    buildMenu()

    let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web")
    var extra: [String: URL] = [:]
    if let selfTest {
      extra["__fixtures"] = selfTest.fixtures
      try? FileManager.default.createDirectory(at: selfTest.outDir, withIntermediateDirectories: true)
    }

    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(BundleSchemeHandler(root: webRoot, extra: extra), forURLScheme: appScheme)
    config.mediaTypesRequiringUserActionForPlayback = []
    config.userContentController.add(self, name: "reels")
    config.userContentController.addUserScript(
      WKUserScript(source: errorHookScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))

    webView = ReelsWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.underPageBackgroundColor = darkBackground
    if #available(macOS 13.3, *) { webView.isInspectable = true }

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1200, height: 860),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered, defer: false)
    window.title = "Sugar Lounge Reels"
    window.minSize = NSSize(width: 420, height: 600)
    window.backgroundColor = darkBackground
    window.contentView = webView
    window.delegate = self
    window.isReleasedWhenClosed = false
    window.center()
    window.setFrameAutosaveName("MainWindow")
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    webView.load(URLRequest(url: startURL))

    if let selfTest {
      DispatchQueue.main.asyncAfter(deadline: .now() + selfTest.timeoutSeconds) { [weak self] in
        self?.finishSelfTest(ok: false, reason: "timeout")
      }
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func applicationWillTerminate(_ notification: Notification) {
    // Selftest хэзээ ч ердийн замаар хаагдах ёсгүй (finishSelfTest exit() хийдэг)
    finishSelfTest(ok: false, reason: "app terminated before the test finished")
  }

  // MARK: Хадгалаагүй ажлаа алдахаас сэргийлэх

  // Цонх хаах (улаан товч, ⌘W) нь програмаас гарахтай адил — бүгдийг нэг асуултаар шийднэ
  func windowShouldClose(_ sender: NSWindow) -> Bool {
    NSApp.terminate(nil)
    return false
  }

  // Вэб апп төлөв өөрчлөгдөх бүрт ({step:'pending'}) шинэчилдэг тул энд хүлээлгүй шууд шийднэ.
  // (terminateLater + async JS + sheet хослол гацдаг байсан — selftest илрүүлсэн)
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard let message = pendingQuit else { return .terminateNow }
    return confirm(message, action: "Гарах") ? .terminateNow : .terminateCancel
  }

  private func confirm(_ message: String, action: String) -> Bool {
    if window.isMiniaturized { window.deminiaturize(nil) }
    NSApp.activate(ignoringOtherApps: true)
    selfTestReport["lastPrompt"] = message
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = message
    alert.informativeText = "Үргэлжлүүлбэл энэ ажил устна."
    alert.addButton(withTitle: "Болих")
    alert.addButton(withTitle: action).hasDestructiveAction = true
    let started = Date()
    let response = alert.runModal()
    selfTestReport["modalResponse"] = response.rawValue
    selfTestReport["modalMs"] = Int(Date().timeIntervalSince(started) * 1000)
    return response == .alertSecondButtonReturn
  }

  // MARK: Цэс — Edit цэсгүй бол текст талбарт ⌘C/⌘V ажиллахгүй

  private func buildMenu() {
    let main = NSMenu()

    let app = NSMenu()
    app.addItem(withTitle: "Sugar Lounge Reels-ийн тухай",
                action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    app.addItem(.separator())
    app.addItem(withTitle: "Нуух", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    app.addItem(withTitle: "Гарах", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    addSubmenu(app, title: "Sugar Lounge Reels", to: main)

    let edit = NSMenu(title: "Засах")
    edit.addItem(withTitle: "Буцаах", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Дахин хийх", action: Selector(("redo:")), keyEquivalent: "Z")
    edit.addItem(.separator())
    edit.addItem(withTitle: "Таслах", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Хуулах", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Буулгах", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Бүгдийг сонгох", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    addSubmenu(edit, title: "Засах", to: main)

    let view = NSMenu(title: "Харах")
    view.addItem(withTitle: "Дахин ачаалах", action: #selector(reload), keyEquivalent: "r").target = self
    let fullScreen = view.addItem(withTitle: "Бүтэн дэлгэц", action: #selector(NSWindow.toggleFullScreen(_:)),
                                  keyEquivalent: "f")
    fullScreen.keyEquivalentModifierMask = [.command, .control]
    addSubmenu(view, title: "Харах", to: main)

    let windowMenu = NSMenu(title: "Цонх")
    windowMenu.addItem(withTitle: "Жижигрүүлэх", action: #selector(NSWindow.performMiniaturize(_:)),
                       keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Хаах", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    addSubmenu(windowMenu, title: "Цонх", to: main)
    NSApp.windowsMenu = windowMenu

    NSApp.mainMenu = main
  }

  private func addSubmenu(_ menu: NSMenu, title: String, to main: NSMenu) {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.submenu = menu
    main.addItem(item)
  }

  @objc private func reload() {
    if let message = pendingReload, !confirm(message, action: "Дахин ачаалах") { return }
    webView.load(URLRequest(url: startURL))
  }

  // MARK: Навигаци

  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               preferences: WKWebpagePreferences,
               decisionHandler: @escaping @MainActor (WKNavigationActionPolicy, WKWebpagePreferences) -> Void)
  {
    if action.shouldPerformDownload {
      decisionHandler(.download, preferences)
      return
    }
    // Гадны линкийг үндсэн хөтчид нээнэ
    if let url = action.request.url, url.scheme != appScheme, url.scheme != "blob", url.scheme != "about" {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel, preferences)
      return
    }
    decisionHandler(.allow, preferences)
  }

  func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
               decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void)
  {
    decisionHandler(response.canShowMIMEType ? .allow : .download)
  }

  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if let selfTest {
      webView.evaluateJavaScript(selfTest.script)
    }
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    // Санах ой дүүрвэл WebKit процесс унадаг — хоосон цонх үлдээхгүйн тулд дахин ачаалж, учрыг хэлнэ
    NSLog("SugarLoungeReels: web content process terminated")
    // Үхсэн процесс дахь ажлыг хамгаалах зүйл үлдээгүй; шинэ хуудас өөрийн төлөвөө дахин мэдэгдэнэ
    pendingQuit = nil
    pendingReload = nil
    if selfTest != nil {
      finishSelfTest(ok: false, reason: "web content process terminated")
      return
    }
    let now = Date()
    crashTimes = crashTimes.filter { now.timeIntervalSince($0) < 60 } + [now]

    let alert = NSAlert()
    alert.alertStyle = .warning
    if crashTimes.count > 2 {
      // Ачаалах бүрт унаж байвал дахин дахин оролдохгүй — хэрэглэгч шийднэ
      alert.messageText = "Програм дахин дахин зогсож байна"
      alert.informativeText = "Санах ой хүрэлцэхгүй байж магадгүй. Бусад програмаа хаагаад дахин оролдоно уу."
      alert.addButton(withTitle: "Дахин оролдох")
      alert.addButton(withTitle: "Гарах")
      alert.beginSheetModal(for: window) { [weak self] response in
        guard let self else { return }
        if response == .alertFirstButtonReturn {
          self.crashTimes.removeAll()
          self.webView.load(URLRequest(url: startURL))
        } else {
          exit(0)
        }
      }
      return
    }
    webView.load(URLRequest(url: startURL))
    alert.messageText = "Програм дахин ачаалагдлаа"
    alert.informativeText = "Санах ой дүүрсэн тул бичлэгүүд арилсан. Дахин нэмнэ үү — том (4K) бичлэг цөөн байвал сайн."
    alert.addButton(withTitle: "Ойлголоо")
    alert.beginSheetModal(for: window)
  }

  // MARK: Файл сонгох (<input type=file>)

  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
               initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping @MainActor ([URL]?) -> Void)
  {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    // Аппын бүх файл талбар (бичлэг/зураг, хөгжим, лого) медиа хүлээдэг
    panel.allowedContentTypes = [.audiovisualContent, .image]
    panel.beginSheetModal(for: window) { result in
      completionHandler(result == .OK ? panel.urls : nil)
    }
  }

  // MARK: Видео хадгалах (<a download>)

  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                suggestedFilename: String,
                completionHandler: @escaping @MainActor (URL?) -> Void)
  {
    if let selfTest {
      let dest = selfTest.outDir.appendingPathComponent(suggestedFilename)
      try? FileManager.default.removeItem(at: dest)
      downloads[ObjectIdentifier(download)] = dest
      completionHandler(dest)
      return
    }
    let panel = NSSavePanel()
    panel.nameFieldStringValue = suggestedFilename
    panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    panel.beginSheetModal(for: window) { [weak self] result in
      guard result == .OK, let url = panel.url else {
        completionHandler(nil)
        return
      }
      // Ижил нэртэй файлыг солихыг панель аль хэдийн асуусан. WKDownload байгаа файл дээр бичдэггүй.
      try? FileManager.default.removeItem(at: url)
      self?.downloads[ObjectIdentifier(download)] = url
      completionHandler(url)
    }
  }

  func downloadDidFinish(_ download: WKDownload) {
    guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
    // Яг хадгалсан видеоны blob URL-ыг дамжуулна — энэ хооронд шинэ видео гарсан бол түүнийг тэмдэглэхгүй
    let source = download.originalRequest?.url?.absoluteString ?? ""
    let markSaved = """
    if (window.__reels && window.__reels.markSaved) window.__reels.markSaved(source);
    return window.__reels ? window.__reels.pendingWork(false) : null;
    """
    if let selfTest {
      // Хадгалсны дараа "хадгалаагүй видео" гэж дахин асуух ёсгүй
      webView.callAsyncJavaScript(markSaved, arguments: ["source": source], in: nil, in: .page) { [weak self] result in
        guard let self else { return }
        var finalURL = url
        if selfTest.mode == .render, let name = selfTest.outName {
          let renamed = selfTest.outDir.appendingPathComponent(name + "." + url.pathExtension)
          try? FileManager.default.removeItem(at: renamed)
          if (try? FileManager.default.moveItem(at: url, to: renamed)) != nil { finalURL = renamed }
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: finalURL.path)[.size] as? Int) ?? -1
        let expected = self.selfTestReport["size"] as? Int ?? -2
        let pendingAfterSave = try? result.get() as? String
        self.selfTestReport["savedFile"] = finalURL.path
        self.selfTestReport["savedSize"] = size
        self.selfTestReport["pendingAfterSave"] = pendingAfterSave ?? NSNull()
        let quitPrompted = self.selfTestReport["quitPrompt"] as? Bool == true
        var problems: [String] = []
        if size <= 0 || size != expected { problems.append("saved size mismatch") }
        if selfTest.mode == .selftest && !quitPrompted { problems.append("no quit prompt for unsaved video") }
        if pendingAfterSave != nil { problems.append("still pending after save") }
        self.finishSelfTest(ok: problems.isEmpty, reason: problems.isEmpty ? nil : problems.joined(separator: "; "))
      }
      return
    }
    webView.callAsyncJavaScript(markSaved, arguments: ["source": source], in: nil, in: .page)
    // AirDrop-оор утас руу явуулахад хялбар болгож Finder-т харуулна
    NSWorkspace.shared.activateFileViewerSelecting([url])
  }

  // Selftest: хадгалаагүй видеотой үед ⌘Q асуулт гарч, "Болих" дарахад програм үлдэх ёстой
  private func selfTestQuitPromptThenSave() {
    // ⌘Q дарсантай адил: WebKit-ийн callback дотроос биш, тусдаа ээлжээс дуудна
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.answerModalWithCancel(attempt: 0)
      NSApp.terminate(nil) // асуулт гарвал "Болих" хүртэл энд блоклоно; асуулт гараагүй бол програм хаагдана
      self.selfTestReport["aliveAfterCancel"] = true
      self.webView.evaluateJavaScript("document.getElementById('saveBtn').click(); null")
    }
  }

  // runModal үед main queue-ийн блок ажилладаггүй — modalPanel горимд Timer ашиглана
  private func answerModalWithCancel(attempt: Int) {
    let timer = Timer(timeInterval: 0.25, repeats: false) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self else { return }
        if NSApp.modalWindow == nil && attempt < 24 {
          self.answerModalWithCancel(attempt: attempt + 1)
          return
        }
        self.selfTestReport["quitPrompt"] = NSApp.modalWindow != nil
        guard NSApp.modalWindow != nil else { return }
        NSApp.stopModal(withCode: .alertFirstButtonReturn) // "Болих"
        // stopModal нь дараагийн event хүртэл хүлээдэг тул хоосон event илгээнэ
        if let wake = NSEvent.otherEvent(with: .applicationDefined, location: .zero, modifierFlags: [],
                                         timestamp: 0, windowNumber: 0, context: nil,
                                         subtype: 0, data1: 0, data2: 0)
        {
          NSApp.postEvent(wake, atStart: true)
        }
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    RunLoop.main.add(timer, forMode: .modalPanel)
  }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    downloads.removeValue(forKey: ObjectIdentifier(download))
    if selfTest != nil {
      finishSelfTest(ok: false, reason: "download failed: \(error.localizedDescription)")
      return
    }
    let alert = NSAlert()
    alert.messageText = "Видеог хадгалж чадсангүй"
    alert.informativeText = error.localizedDescription
    alert.beginSheetModal(for: window)
  }

  // MARK: JS → native

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let text = message.body as? String,
          let data = text.data(using: .utf8),
          let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let step = obj["step"] as? String
    else { return }

    switch step {
    case "jserror":
      let line = "\(obj["message"] ?? "") \(obj["at"] ?? "")"
      NSLog("SugarLoungeReels JS error: %@", line)
      jsErrors.append(line)
    case "pending":
      pendingQuit = obj["quit"] as? String
      pendingReload = obj["reload"] as? String
    case "exported":
      selfTestReport.merge(obj) { _, new in new }
      if selfTest?.mode == .render {
        webView.evaluateJavaScript("document.getElementById('saveBtn').click(); null")
      } else if selfTest != nil {
        selfTestQuitPromptThenSave()
      }
    case "error":
      finishSelfTest(ok: false, reason: obj["message"] as? String ?? "unknown")
    default:
      break
    }
  }

  private func finishSelfTest(ok: Bool, reason: String?) {
    guard let selfTest else { return }
    var report = selfTestReport
    report["ok"] = ok && jsErrors.isEmpty
    report["jsErrors"] = jsErrors
    if let reason { report["reason"] = reason }
    if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
      try? data.write(to: selfTest.outDir.appendingPathComponent("selftest.json"))
      FileHandle.standardOutput.write(data)
      FileHandle.standardOutput.write(Data("\n".utf8))
    }
    exit(report["ok"] as? Bool == true ? 0 : 1)
  }
}

// MARK: - Эхлэл

MainActor.assumeIsolated {
  let app = NSApplication.shared
  let delegate = AppDelegate(selfTest: SelfTest.parse(CommandLine.arguments))
  app.delegate = delegate
  app.setActivationPolicy(.regular)
  withExtendedLifetime(delegate) { app.run() }
}
