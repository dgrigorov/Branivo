# OCR Wizard — Implementation Reference

> Read this file instead of re-reading source files. Update when implementation changes.

## Files

| File | Purpose |
|---|---|
| `branivo_app/lib/features/ocr/screens/ocr_wizard_screen.dart` | Root widget — camera lifecycle, flash, auto-capture state, image stream |
| `branivo_app/lib/features/ocr/screens/ocr_camera_view.dart` | Camera UI — preview fill, doc frame overlay, flash/auto-capture buttons, thumbnails |
| `branivo_app/lib/features/ocr/screens/ocr_crop_editor_view.dart` | Perspective crop editor — draggable corners, screen→image coord conversion |
| `branivo_app/lib/features/ocr/screens/ocr_processing_view.dart` | `OcrStepProcessingView`, `OcrFinalProcessingView`, `OcrPreviewView`, `OcrFailedView` |
| `branivo_app/lib/features/ocr/screens/ocr_results_view.dart` | Results/confirmation screen |
| `branivo_app/lib/features/ocr/screens/ocr_wizard_constants.dart` | Design tokens, `kTotalSteps=3`, step titles/subs/legends |
| `branivo_app/lib/features/ocr/bloc/ocr_wizard_bloc.dart` | BLoC — state machine |
| `branivo_app/lib/features/ocr/bloc/ocr_wizard_event.dart` | Events (part of bloc file) |
| `branivo_app/lib/features/ocr/bloc/ocr_wizard_state.dart` | States (part of bloc file) |
| `branivo_app/lib/features/ocr/data/repositories/branivo_ocr_repository.dart` | HTTP calls to Python OCR microservice |
| `branivo_app/lib/features/ocr/data/repositories/mlkit_ocr_repository.dart` | ML Kit local fallback |
| `branivo_app/lib/features/ocr/data/repositories/ocr_repository.dart` | Abstract interface |
| `branivo_app/lib/features/ocr/data/repositories/ocr_models.dart` | `OcrField`, `OcrScanResponse`, `OcrJobStatus` |
| `branivo_app/lib/features/ocr/data/services/talon_parser.dart` | Parses raw OCR text into structured fields |
| `branivo_app/test/features/ocr/ocr_wizard_bloc_test.dart` | BLoC unit tests |

---

## Flow (Capture-All → Crop-Each → Process)

```
Phase 1: CAPTURE (camera open)
  OcrCapturingState(step:0) → user shoots photo →
  OcrCapturingState(step:1, capturedImages:[img0]) → user shoots →
  OcrCapturingState(step:2, capturedImages:[img0,img1]) → user shoots →

Phase 2: CROP (all 3 images captured)
  OcrCropState(step:0, image:img0) → user drags corners → confirm →
  OcrCropState(step:1, image:img1) → user drags corners → confirm →
  OcrCropState(step:2, image:img2) → user drags corners → confirm →

Phase 3: PROCESS
  OcrStepProcessingState(step:2) [1.5s animation] →
  OcrScanSubmittedEvent → OcrProcessingState →
  OcrCompletedState | OcrFailedState
```

**Retake** (from any crop state): clears ALL images + corners → back to `OcrCapturingState(step:0)`.

---

## BLoC State Machine

```dart
// States
OcrInitialState
OcrCapturingState { step, capturedImages }   // camera open
OcrCropState      { step, image, corners, sessionToken }
OcrStepProcessingState { step, image }       // brief 1.5s animation
OcrProcessingState { jobId }                 // waiting for API
OcrCompletedState  { fields, jobId, rawText, debugImages }
OcrFailedState     { errorMessage? }
OcrManualInputState
OcrPreviewState    { step, image }           // unused in current flow

// Events
OcrStartCaptureEvent { sessionToken }
OcrImageCapturedEvent { step, image }
OcrCropConfirmedEvent { step, corners, sessionToken }
OcrPreviewRetakeEvent { step }               // → clears ALL, back to step 0
OcrScanSubmittedEvent { sessionToken }
OcrStatusPolledEvent { jobId }
OcrManualFallbackRequestedEvent
OcrPreviewConfirmedEvent { step, sessionToken } // legacy, kept for compat
```

---

## Camera View — `OcrCameraView`

**Parameters:**
```dart
step, capturedImages (List<String> paths), camera, cameraReady, zoom, minZoom, maxZoom,
flashEnabled, autoCaptureEnabled, isDocumentDetected,
onCapture, onManualEntry, onFlashToggle, onAutoCaptureToggle,
onScaleStart, onScaleUpdate, onTapFocus
```

**UI structure:**
- Full-screen camera fill (`_CameraFill` — FittedBox.cover)
- `_DocFramePainter` overlay: indigo corner brackets normally, green fill+border when `detected`
- Top bar: back, document type label, step pills, flash btn, auto-capture btn (Α)
- Thumbnails strip: bottom-right, shows captured photos as small cards
- Bottom sheet: step info, legend chips, manual capture button

**Document frame rect formula:**
```
Rect.fromLTWH(w*0.05, h*0.15, w*0.90, w*0.90*0.64)  // 16:10 ratio, 90% width
```

---

## Wizard Screen — `OcrWizardScreen`

**State fields:**
```dart
CameraController? _camera
bool _cameraReady, _flashEnabled, _autoCaptureEnabled
bool _isDocumentDetected, _autoCaptureLock
List<int>? _prevSamples
int _stableFrames
```

**Auto-capture algorithm (`_analyzeFrame`):**
1. Sample 8×8 grid (64 pixels) from Y plane (or first channel on iOS)
2. Reject if avg luma < 40 or > 235 (dark/blown out)
3. Compare with previous frame: if avg pixel diff < 8 → increment `_stableFrames`, else decrement
4. When `_stableFrames >= 10` → set `_isDocumentDetected = true` (green overlay)
5. When `_stableFrames >= 20` → set `_autoCaptureLock = true`, stop stream, call `_takePhoto`

**Stream lifecycle:**
- Start: when `_autoCaptureEnabled` toggled ON, or when `OcrCapturingState` emitted + auto enabled
- Stop: when `OcrCropState`, `OcrStepProcessingState`, `OcrProcessingState` emitted
- Must call `stopImageStream()` BEFORE `takePicture()` — camera package requirement

**Flash:** `FlashMode.torch` (on) / `FlashMode.off` — no auto mode.

---

## Crop Editor — `OcrCropEditorView`

**Critical bug fix (was broken before):**
Corners are stored in screen-space (0..1 relative to screen), but the Python service expects
image-space (0..1 relative to the image's displayed rect). The conversion happens in `_confirm()`:

```dart
List<Offset> _toImageCorners(Size screenSize) {
  return _corners.map((c) {
    final sx = c.dx * screenSize.width;
    final sy = c.dy * screenSize.height;
    final ix = ((sx - _imgLeft) / _displayW).clamp(0.0, 1.0);
    final iy = ((sy - _imgTop) / _displayH).clamp(0.0, 1.0);
    return Offset(ix, iy);
  }).toList();
}
```

`_imgLeft`, `_imgTop`, `_displayW`, `_displayH` are computed once image is decoded via
`_computeLayout()` (BoxFit.contain letterbox math).

**State:**
```dart
List<Offset> _corners        // screen-space 0..1, 4 points TL/TR/BR/BL
List<Offset>? _defaultCorners // reset target (10% inset from image rect)
double _imgLeft, _imgTop, _displayW, _displayH
Uint8List? _imageBytes
```

**Confirm button label:** "Следваща снимка" (steps 0-1) / "Запази и анализирай" (step 2).

---

## OCR Repository — `BranivoOcrRepository`

**Endpoint:** `POST /ocr/talon?step={1|2|3}&debug=true`

**Payload:** `multipart/form-data`
- `file` — JPEG image bytes
- `points` (optional) — JSON `[[x,y],[x,y],[x,y],[x,y]]` in image-space 0..1

**Step mapping:** `[1, 2, 3]` → Python steps 1/2/3

**Response merging:** first non-null value per field wins across 3 steps.

**Debug mode:** response includes `preview_b64` (base64 JPEG of what Tesseract processed).

---

## Design Tokens

```dart
kOcrBg      = 0xFF0A0A0A  // background
kOcrSurface = 0xFF1A1A2E  // card/surface
kOcrIndigo  = 0xFF6366F1  // primary action, active state
kOcrBlue    = 0xFF60A5FA  // crop handles, secondary
kOcrGreen   = 0xFF10B981  // success, document detected, captured thumbnail border
kOcrMuted   = 0xFF64748B  // muted labels
kOcrTextSub = 0xFF94A3B8  // subtitle text
```

---

## Document Type: Small Vehicle Registration Card (Малък талон)

**3 sides:**
- Step 0 (Лични данни): MRZ zone, EGN, owner name/address — Python step 1
- Step 1 (Данните на МПС-то): reg. plate, VIN, make/model, color — Python step 2
- Step 2 (Специфики на МПС-то): category, dates, engine, fuel, EURO — Python step 3

---

## Packages Used

```yaml
camera: ^0.10.5+9                    # camera preview + image stream
image_picker: ^1.1.2                 # XFile type for captured images
google_mlkit_text_recognition: ^0.15.0  # local OCR fallback
permission_handler: ^11.3.1
flutter_bloc: (state management)
dio: (HTTP multipart upload)
```
