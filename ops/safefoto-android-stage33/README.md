# Safe Foto Stage33 — Android 15 emulator / Linux visual QA

2026-11-05 · kris-Standard TEST only. Branch: `fix/safefoto-android-emulator-nav-stage33-20261105` based on Android Stage32.

## Environment
- Preinstalled Android Emulator + Android 35 Google APIs x86_64 image and existing AVD `safefoto-stage2`.
- Hardware KVM **available**, emulator boot completed; `adb devices -l` -> `emulator-5554 device`.
- Emulator run **headless** with `-no-window -no-snapshot -no-audio -no-boot-anim -gpu swiftshader_indirect -accel on -memory 2048 -port 5554`. Phone screen 720×1280, 300dpi. Emulator left running for further testing; PID can change, use `adb devices -l`.
- Installed existing Stage32 ARM64 APK cannot run on x86_64 AVD because `libapp.so` contains ARM64 only. Built separate profile APK using `flutter build apk --profile --target-platform android-x64 --no-pub` and confirmed `lib/x86_64/libapp.so`.
- Android package `pl.safefoto.app`, `versionCode=3054`, `versionName=3.0.1`, Android target 36.

## Visual inspection
- Successfully installed x86_64 SafeFoto via `adb install -r` and launched `pl.safefoto.app/app.alextran.immich.MainActivity`.
- AVD retains a **prior test session with actual private media**. Screenshots are therefore NOT suitable for GitHub or public sharing.
- Checked `Moje zdjęcia`, `Zdjęcia rodziny`, `Więcej`. Gallery displays authenticated thumbnail media, month/day headings, family album filters and five-tab navigation. No foreground app crash or recent `FATAL EXCEPTION` found.
- Found UI bug: five long translated tab labels were cut off on 720px/300dpi phone view (`Moje zdję...`, `Zdjęcia ro...`). Fixed **bottom navigation only** to `Moje`, `Rodzina`, `Szukaj`, `Albumy`, `Więcej`; full localized screen titles and navigation rail remain unchanged.
- Rebuilt x86_64 APK, reinstalled with adb, verified visually using screenshots: all five labels now display in full; opening family tab still works.
- The family album choice-chip row scrolls horizontally, and the rightmost chips may be partially hidden until horizontally swiped. Not changed at this stage; possible UX follow-up (scroll hint/fade).
- App displays existing actual thumbnails on authenticated AVD; this is visual inspection, **not** a test of new mobile backup, external authentication, camera, or offline cache correctness.

## Tests/build
- Dart formatter and `dart analyze mobile/lib/pages/common/tab_shell.page.dart`: PASS, no issues.
- Relevant Flutter regression suite: `flutter test test/widgets/safefoto_stage31_test.dart test/presentation/family_gallery_page_test.dart test/presentation/family_bulk_action_test.dart` -> **17/17 PASS**.
- Rebuilt emulator x86_64 profile APK -> `/srv/tests/safefoto/builds/SafeFoto-Test-Stage33-Android15-emulator-x64.apk`, ~164MB; SHA-256 `67297f3abadf32c9e219c6b303a3faab974649676b7e92e30d6786e3f4d3170a`.
- This x86_64 APK is for the **emulator**, not for a physical ARM Android phone. Stage32 ARM64 APK remains unchanged at `/srv/tests/safefoto/builds/SafeFoto-Test-Android-stage32-20261105-arm64.apk`.
- `scrcpy` installed is v1.25, which cannot mirror Android 15 (`SurfaceControl.createDisplay` API incompatibility). Emulator continues headlessly through ADB; update scrcpy to 3.x or run a graphical AVD if an interactive host window is desired.
- Test screenshots with personal/test account media stored **locally only** at `/srv/tests/safefoto/qa-private/stage33/` with directory 0700, images 0600, outside Git repositories. Removed temporary screenshots from emulator and /tmp. **Never commit/upload these images without explicit approval and privacy review.**
- No changes to test LAB server, DB, real media, Synology or production My Free Server. Docker LAB remains healthy.
