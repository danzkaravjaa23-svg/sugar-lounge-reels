// Selftest-д хэрэглэх туршилтын MP4 үүсгэнэ (ffmpeg хэрэггүй, AVFoundation).
//   swiftc -O scripts/make_fixtures.swift -o dist/make_fixtures
//   dist/make_fixtures <out.mp4> <секунд> <r> <g> <b>
// scripts/make-test-fixtures.sh үүнийг дуудна.

import AVFoundation
import CoreGraphics
import Foundation

let args = CommandLine.arguments
let out = URL(fileURLWithPath: args[1])
let secs = Double(args[2])!
let (r, g, b) = (Double(args[3])!, Double(args[4])!, Double(args[5])!)
let width = 720, height = 1280, fps = 30
try? FileManager.default.removeItem(at: out)

let writer = try! AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

for i in 0..<Int(secs * Double(fps)) {
  while !input.isReadyForMoreMediaData { usleep(2000) }
  var buffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
  let pb = buffer!
  CVPixelBufferLockBaseAddress(pb, [])
  let ctx = CGContext(
    data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  let t = Double(i) / Double(fps)
  ctx.setFillColor(red: r, green: g, blue: b, alpha: 1)
  ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
  // Хөдөлгөөн: тойрог эргэлдэж, бараан зурвас дээрээс доош урсана
  ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 0.9)
  ctx.fillEllipse(in: CGRect(x: 290 + sin(t * 3) * 220, y: 570 + cos(t * 2) * 350, width: 140, height: 140))
  ctx.setFillColor(red: 0, green: 0, blue: 0, alpha: 0.6)
  ctx.fill(CGRect(x: 0, y: Double(height) * (1 - t / secs) - 30, width: Double(width), height: 60))
  CVPixelBufferUnlockBaseAddress(pb, [])
  adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: CMTimeScale(fps)))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else {
  FileHandle.standardError.write(Data("failed: \(String(describing: writer.error))\n".utf8))
  exit(1)
}
print("✓ \(out.lastPathComponent) \(secs)с")
