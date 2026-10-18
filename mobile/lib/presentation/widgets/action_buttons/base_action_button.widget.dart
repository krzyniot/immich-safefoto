import 'package:flutter/material.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/widgets/common/safefoto_icon.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';

class BaseActionButton extends ConsumerStatefulWidget {
  const BaseActionButton({
    super.key,
    required this.label,
    required this.iconData,
    this.iconColor,
    this.onPressed,
    this.onLongPressed,
    this.maxWidth = 90.0,
    this.minWidth,
    this.iconOnly = false,
    this.menuItem = false,
  });

  final String label;
  final IconData iconData;
  final Color? iconColor;
  final double maxWidth;
  final double? minWidth;

  /// When true, renders only an IconButton without text label
  final bool iconOnly;

  /// When true, renders as a MenuItemButton for use in MenuAnchor menus
  final bool menuItem;
  final void Function()? onPressed;
  final void Function()? onLongPressed;

  @override
  ConsumerState<BaseActionButton> createState() => _BaseActionButtonState();
}

class _BaseActionButtonState extends ConsumerState<BaseActionButton> {
  int _trigger = 0;
  bool _pressed = false;
  @override
  Widget build(BuildContext context) {
    final label = widget.label;
    final iconData = widget.iconData;
    final maxWidth = widget.maxWidth;
    final minWidth = widget.minWidth;
    final iconOnly = widget.iconOnly;
    final menuItem = widget.menuItem;
    final onLongPressed = widget.onLongPressed;
    final onPressed = widget.onPressed == null
        ? null
        : () {
            setState(() => _trigger++);
            widget.onPressed!();
          };
    final style = ref.watch(appConfigProvider.select((config) => config.theme.iconStyle));
    Widget artwork(double size, Color? color) {
      final symbol = safeFotoActionSymbol(iconData);
      return symbol == null
          ? Icon(iconData, size: size, color: color)
          : SafeFotoIcon(
              symbol: symbol,
              style: style,
              size: size,
              color: onPressed == null ? Theme.of(context).disabledColor : color,
              active: _pressed,
              trigger: _trigger,
            );
    }

    final miniWidth = minWidth ?? (context.isMobile ? context.width / 4.5 : 75.0);
    final iconTheme = IconTheme.of(context);
    final iconSize = iconTheme.size ?? 24.0;
    final textColor = context.themeData.textTheme.labelLarge?.color;

    if (iconOnly) {
      final iconColor = widget.iconColor ?? iconTheme.color ?? context.themeData.iconTheme.color;

      return IconButton(onPressed: onPressed, onLongPress: onLongPressed, icon: artwork(iconSize, iconColor));
    }

    if (menuItem) {
      final iconColor = widget.iconColor;

      return MenuItemButton(
        closeOnActivate: false,
        style: MenuItemButton.styleFrom(
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
        leadingIcon: artwork(20, iconColor),
        onPressed: onPressed == null
            ? null
            : () {
                onPressed();
                MenuController.maybeOf(context)?.close();
              },
        child: Text(label, style: TextStyle(fontSize: 15, color: iconColor)),
      );
    }

    final iconColor = widget.iconColor ?? iconTheme.color ?? context.themeData.iconTheme.color;

    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: MaterialButton(
        onHighlightChanged: (value) => setState(() => _pressed = value),
        color: context.colorScheme.surfaceContainerHigh.withValues(alpha: 0.45),
        elevation: 0,
        padding: const EdgeInsets.all(10),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(20))),
        textColor: textColor,
        onPressed: onPressed,
        onLongPress: onLongPressed,
        minWidth: miniWidth,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            artwork(iconSize, iconColor),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(fontSize: 14.0, fontWeight: FontWeight.w400),
              maxLines: 3,
              textAlign: TextAlign.center,
              softWrap: true,
            ),
          ],
        ),
      ),
    );
  }
}
