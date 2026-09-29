import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/widgets/settings/preference_settings/primary_color_setting.dart';
import 'package:immich_mobile/widgets/settings/setting_group_title.dart';
import 'package:immich_mobile/widgets/settings/settings_switch_list_tile.dart';

class ThemeSetting extends HookConsumerWidget {
  const ThemeSetting({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentTheme = useState(ref.read(appConfigProvider.select((config) => config.theme.mode)));
    final isDarkTheme = useValueNotifier(currentTheme.value == ThemeMode.dark);
    final isSystemTheme = useValueNotifier(currentTheme.value == ThemeMode.system);
    final colorfulInterface = useValueNotifier(
      ref.watch(appConfigProvider.select((config) => config.theme.colorfulInterface)),
    );

    void onThemeChange(bool isDark) {
      currentTheme.value = isDark ? ThemeMode.dark : ThemeMode.light;
      ref.read(settingsProvider).write(.themeMode, currentTheme.value);
    }

    void onSystemThemeChange(bool isSystem) {
      if (isSystem) {
        currentTheme.value = ThemeMode.system;
        isSystemTheme.value = true;
      } else {
        final currentSystemBrightness = context.platformBrightness;
        isSystemTheme.value = false;
        isDarkTheme.value = currentSystemBrightness == Brightness.dark;
        if (currentSystemBrightness == Brightness.light) {
          currentTheme.value = ThemeMode.light;
        } else if (currentSystemBrightness == Brightness.dark) {
          currentTheme.value = ThemeMode.dark;
        }
      }
      ref.read(settingsProvider).write(.themeMode, currentTheme.value);
    }

    void onSurfaceColorSettingChange(bool useColorfulInterface) {
      ref.read(settingsProvider).write(.themeColorfulInterface, useColorfulInterface);
      colorfulInterface.value = useColorfulInterface;
    }

    final appearance = ref.watch(appConfigProvider.select((config) => config.theme));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SettingGroupTitle(
          title: "theme".t(context: context),
          icon: Icons.color_lens_outlined,
        ),
        SettingsSwitchListTile(
          valueNotifier: isSystemTheme,
          title: 'theme_setting_system_theme_switch'.t(context: context),
          onChanged: onSystemThemeChange,
        ),
        if (currentTheme.value != ThemeMode.system)
          SettingsSwitchListTile(
            valueNotifier: isDarkTheme,
            title: 'map_settings_dark_mode'.t(context: context),
            onChanged: onThemeChange,
          ),
        const PrimaryColorSetting(),
        const ListTile(
          title: Text('Wygląd SafeFoto'),
          subtitle: Text('Wybierz styl ikon i tło aplikacji'),
          leading: Icon(Icons.auto_awesome_outlined),
        ),
        ListTile(
          title: const Text('Zestaw ikon'),
          subtitle: Text(const ['Klasyczny', 'Zaokrąglony', 'Wyrazisty'][appearance.iconStyle.clamp(0, 2)]),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => showModalBottomSheet<void>(
            context: context,
            showDragHandle: true,
            builder: (sheetContext) => SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var index = 0; index < 3; index++)
                    ListTile(
                      leading: Icon([Icons.photo_outlined, Icons.photo_rounded, Icons.photo_library_rounded][index]),
                      title: Text(const ['Klasyczny', 'Zaokrąglony', 'Wyrazisty'][index]),
                      trailing: appearance.iconStyle == index ? const Icon(Icons.check) : null,
                      onTap: () {
                        ref.read(settingsProvider).write(.themeIconStyle, index);
                        Navigator.pop(sheetContext);
                      },
                    ),
                ],
              ),
            ),
          ),
        ),
        ListTile(
          title: const Text('Tło aplikacji'),
          subtitle: Text(const ['Grafitowe', 'Głębokie', 'Złoty akcent'][appearance.backgroundStyle.clamp(0, 2)]),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => showModalBottomSheet<void>(
            context: context,
            showDragHandle: true,
            builder: (sheetContext) => SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var index = 0; index < 3; index++)
                    ListTile(
                      leading: CircleAvatar(
                        backgroundColor: const [Color(0xFF171A25), Color(0xFF0B1020), Color(0xFF3C2D1A)][index],
                      ),
                      title: Text(const ['Grafitowe', 'Głębokie', 'Złoty akcent'][index]),
                      trailing: appearance.backgroundStyle == index ? const Icon(Icons.check) : null,
                      onTap: () {
                        ref.read(settingsProvider).write(.themeBackgroundStyle, index);
                        Navigator.pop(sheetContext);
                      },
                    ),
                ],
              ),
            ),
          ),
        ),
        SettingsSwitchListTile(
          valueNotifier: colorfulInterface,
          title: "theme_setting_colorful_interface_title".t(context: context),
          subtitle: 'theme_setting_colorful_interface_subtitle'.t(context: context),
          onChanged: onSurfaceColorSettingChange,
        ),
      ],
    );
  }
}
