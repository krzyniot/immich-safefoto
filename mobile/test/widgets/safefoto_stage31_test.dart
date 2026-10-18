import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/config/app_config.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/presentation/widgets/bottom_sheet/base_bottom_sheet.widget.dart';
import 'package:immich_mobile/presentation/widgets/action_buttons/base_action_button.widget.dart';
import 'package:immich_mobile/widgets/common/safefoto_icon.dart';

void main() {
  testWidgets('selection grid never attaches to the primary gallery controller', (tester) async {
    final gallery = ScrollController();
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: PrimaryScrollController(
            controller: gallery,
            child: Scaffold(
              body: Stack(
                children: [
                  ListView(primary: true, children: const [SizedBox(height: 1600)]),
                  const BaseBottomSheet(wrapActions: true, actions: [Text('Do albumu'), Text('Więcej')]),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(gallery.positions, hasLength(1));
    expect(gallery.offset, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    gallery.dispose();
  });

  for (var style = 0; style < 3; style++) {
    testWidgets('style $style paints all symbols and finishes motion', (tester) async {
      Widget scene(bool selected, bool reduced) => MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: reduced),
          child: Scaffold(
            body: Wrap(
              children: [
                for (final symbol in SafeFotoSymbol.values)
                  SafeFotoIcon(symbol: symbol, style: style, active: selected),
              ],
            ),
          ),
        ),
      );
      await tester.pumpWidget(scene(false, false));
      await tester.pumpWidget(scene(true, false));
      await tester.pump(const Duration(milliseconds: 180));
      expect(tester.binding.hasScheduledFrame, isTrue);
      await tester.pumpAndSettle();
      expect(tester.binding.hasScheduledFrame, isFalse);
      await tester.pumpWidget(scene(false, true));
      await tester.pump();
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('action labels fit narrow layout with enlarged text', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appConfigProvider.overrideWithValue(const AppConfig())],
        child: MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
            child: Scaffold(
              body: SizedBox(
                width: 320,
                child: BaseBottomSheet(
                  wrapActions: true,
                  initialChildSize: .8,
                  maxChildSize: .9,
                  actions: [
                    for (var i = 0; i < 6; i++)
                      BaseActionButton(label: 'Udostępnij rodzinie', iconData: Icons.groups_outlined, onPressed: () {}),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
