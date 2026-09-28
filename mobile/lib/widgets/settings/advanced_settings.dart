import 'package:flutter/material.dart';
import 'package:immich_mobile/widgets/common/immich_logo.dart';
import 'package:immich_mobile/widgets/settings/settings_sub_page_scaffold.dart';
import 'package:url_launcher/url_launcher.dart';

class AdvancedSettings extends StatelessWidget {
  const AdvancedSettings({super.key});

  Future<void> _openHelp(BuildContext context) async {
    final shouldOpen = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Otworzyć pomoc SafeFoto?'),
        content: const Text(
          'Zostaniesz przekierowany do strony kontaktowej SafeFoto w przeglądarce.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Anuluj'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Otwórz'),
          ),
        ],
      ),
    );

    if (shouldOpen == true) {
      await launchUrl(
        Uri.parse('https://safefoto.pl/kontakt/'),
        mode: LaunchMode.externalApplication,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = [
      ListTile(
        leading: const Icon(Icons.help_outline),
        title: const Text('Pomoc SafeFoto'),
        subtitle: const Text('Kontakt i pomoc w korzystaniu z usługi'),
        onTap: () => _openHelp(context),
      ),
      ListTile(
        leading: const Icon(Icons.code_outlined),
        title: const Text('Kod źródłowy'),
        onTap: () => launchUrl(
          Uri.parse('https://github.com/krzyniot/immich-safefoto'),
          mode: LaunchMode.externalApplication,
        ),
      ),
      ListTile(
        leading: const Icon(Icons.info_outline),
        title: const Text('Licencje'),
        onTap: () => showLicensePage(
          context: context,
          applicationName: 'SafeFoto',
          applicationIcon: const Padding(
            padding: EdgeInsetsGeometry.symmetric(vertical: 10),
            child: ImmichLogo(size: 40),
          ),
        ),
      ),
      const SizedBox(height: 60),
    ];

    return SettingsSubPageScaffold(settings: settings);
  }
}
