import 'dart:math' as math;
import 'package:flutter/material.dart';

enum SafeFotoSymbol { photos, family, search, album, more, menu, share, download, move, favorite, trash, link, add }

/// Original vector artwork. Motion changes individual paths, never the hit target.
class SafeFotoIcon extends StatefulWidget {
  const SafeFotoIcon({
    super.key,
    required this.symbol,
    this.style = 0,
    this.active = false,
    this.color,
    this.size = 28,
    this.trigger = 0,
  });
  final SafeFotoSymbol symbol;
  final int style;
  final bool active;
  final Color? color;
  final double size;
  final int trigger;
  @override
  State<SafeFotoIcon> createState() => _SafeFotoIconState();
}

class _SafeFotoIconState extends State<SafeFotoIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _motion = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );
  bool _reduceMotion = false;
  @override
  void initState() {
    super.initState();
    _motion.value = widget.active ? 1 : 0;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.disableAnimationsOf(context) || MediaQuery.accessibleNavigationOf(context);
    if (_reduceMotion) {
      _motion.value = widget.active ? 1 : 0;
    }
  }

  @override
  void didUpdateWidget(SafeFotoIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.active != widget.active || oldWidget.trigger != widget.trigger) {
      if (_reduceMotion) {
        _motion.value = widget.active ? 1 : 0;
      } else if (oldWidget.trigger != widget.trigger) {
        _motion.forward(from: 0);
      } else {
        _motion.animateTo(widget.active ? 1 : 0, curve: Curves.easeInOutCubic);
      }
    }
  }

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ExcludeSemantics(
      child: RepaintBoundary(
        child: SizedBox.square(
          dimension: widget.size,
          child: AnimatedBuilder(
            animation: _motion,
            builder: (context, _) => CustomPaint(
              painter: SafeFotoIconPainter(
                symbol: widget.symbol,
                style: widget.style,
                progress: _reduceMotion ? (widget.active ? 1 : 0) : _motion.value,
                color: widget.color ?? (widget.active ? scheme.primary : scheme.onSurfaceVariant),
                active: widget.active,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SafeFotoIconPainter extends CustomPainter {
  const SafeFotoIconPainter({
    required this.symbol,
    required this.style,
    required this.progress,
    required this.color,
    required this.active,
  });
  final SafeFotoSymbol symbol;
  final int style;
  final double progress;
  final Color color;
  final bool active;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 32, size.height / 32);
    final rounded = style != 0;
    final pulse = math.sin(math.pi * progress);
    final ink = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = rounded ? 2.1 : 1.65
      ..strokeCap = rounded ? StrokeCap.round : StrokeCap.square
      ..strokeJoin = rounded ? StrokeJoin.round : StrokeJoin.miter;
    final fill = Paint()..color = color;
    if (style == 2 && (active || pulse > 0)) {
      canvas.drawCircle(
        const Offset(16, 16),
        10 + pulse * 2,
        Paint()
          ..color = color.withValues(alpha: .12 + .12 * pulse)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );
      if (pulse > 0) {
        final angle = progress * math.pi * 1.5;
        canvas.drawCircle(Offset(16 + 13 * math.cos(angle), 16 + 13 * math.sin(angle)), 1.2 * pulse, fill);
      }
    }
    void line(double x, double y, double x2, double y2) => canvas.drawLine(Offset(x, y), Offset(x2, y2), ink);
    void box(Rect rect) => canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(rounded ? 4 : 1.5)), ink);
    switch (symbol) {
      case SafeFotoSymbol.photos:
        canvas.save();
        canvas.translate(-pulse * 2, -pulse);
        box(const Rect.fromLTWH(7, 5, 20, 20));
        canvas.restore();
        box(const Rect.fromLTWH(4, 8, 20, 20));
        canvas.drawCircle(const Offset(10, 14), 2, fill);
        canvas.drawPath(
          Path()
            ..moveTo(5, 25)
            ..lineTo(11, 19)
            ..lineTo(15, 23)
            ..lineTo(19, 17)
            ..lineTo(24, 23),
          ink,
        );
      case SafeFotoSymbol.family:
        for (var i = 0; i < 2; i++) {
          final x = i == 0 ? 11.0 - pulse : 23.0 + pulse;
          final y = i == 0 ? 10.0 : 12.0;
          canvas.drawCircle(Offset(x, y), i == 0 ? 4 : 3, ink);
          canvas.drawPath(
            Path()
              ..moveTo(x - 6, 26)
              ..lineTo(x - 6, 24)
              ..cubicTo(x - 6, 17, x + 6, 17, x + 6, 24)
              ..lineTo(x + 6, 26),
            ink,
          );
        }
        if (rounded) {
          line(12, 27, 22, 27);
        }
      case SafeFotoSymbol.search:
        canvas.drawCircle(const Offset(13, 13), 8 + pulse, ink);
        line(19, 19, 26 - pulse * 2, 26 - pulse * 2);
        if (pulse > 0) {
          canvas.drawArc(const Rect.fromLTWH(8, 8, 10, 10), math.pi, math.pi * pulse, false, ink);
        }
      case SafeFotoSymbol.album:
        box(const Rect.fromLTWH(5, 5, 22, 23));
        line(10, 5, 10, 28);
        canvas.drawPath(
          Path()
            ..moveTo(10, 6)
            ..lineTo(25 - 6 * progress, 3 + 2 * progress)
            ..lineTo(25 - 6 * progress, 25)
            ..lineTo(10, 28),
          ink,
        );
        line(14, 12, 20, 12);
        line(14, 17, 19, 17);
      case SafeFotoSymbol.more:
        for (var i = 0; i < 3; i++) {
          canvas.drawCircle(Offset(7 + i * 9.0, 16 - math.sin((progress * math.pi)).abs() * (i == 1 ? 4 : 2)), 2, fill);
        }
        if (rounded) {
          canvas.drawCircle(const Offset(16, 16), 13, ink..color = color.withValues(alpha: .45));
        }
      case SafeFotoSymbol.menu:
        line(6, 8, 26, 8);
        line(6 + progress * 6, 16, 26, 16);
        line(6, 24, 26, 24);
        line(6 + progress * 5, 12, 6, 16);
        line(6, 16, 6 + progress * 5, 20);
      case SafeFotoSymbol.share:
        line(9, 16, 23, 8);
        line(9, 16, 23, 25);
        for (final point in [const Offset(7, 16), Offset(25, 7 - pulse), Offset(25, 26 + pulse)]) {
          canvas.drawCircle(point, 3, ink);
        }
      case SafeFotoSymbol.download:
        line(16, 4 + pulse * 3, 16, 22 + pulse * 3);
        line(10, 17 + pulse * 3, 16, 23 + pulse * 3);
        line(16, 23 + pulse * 3, 22, 17 + pulse * 3);
        canvas.drawPath(
          Path()
            ..moveTo(5, 24)
            ..lineTo(5, 28)
            ..lineTo(27, 28)
            ..lineTo(27, 24),
          ink,
        );
      case SafeFotoSymbol.move:
        canvas.drawPath(
          Path()
            ..moveTo(4, 26)
            ..lineTo(4, 8)
            ..lineTo(13, 8)
            ..lineTo(16, 11)
            ..lineTo(28, 11)
            ..lineTo(28, 26)
            ..close(),
          ink,
        );
        line(10 + pulse * 2, 19, 23 + pulse * 2, 19);
        line(19 + pulse * 2, 15, 23 + pulse * 2, 19);
        line(23 + pulse * 2, 19, 19 + pulse * 2, 23);
      case SafeFotoSymbol.favorite:
        canvas.drawPath(
          Path()
            ..moveTo(16, 27)
            ..cubicTo(11, 22, 3 - pulse, 16, 4, 10)
            ..cubicTo(5, 3, 13, 4, 16, 10)
            ..cubicTo(20, 3, 28, 4, 28, 11)
            ..cubicTo(28 + pulse, 17, 21, 23, 16, 27),
          ink,
        );
      case SafeFotoSymbol.trash:
        canvas.drawPath(
          Path()
            ..moveTo(8, 11)
            ..lineTo(10, 28)
            ..lineTo(23, 28)
            ..lineTo(25, 11),
          ink,
        );
        canvas.save();
        canvas.translate(6, 8);
        canvas.rotate(-pulse * .2);
        line(0, 0, 21, 0);
        line(7, 0, 7, -3);
        line(7, -3, 14, -3);
        line(14, -3, 14, 0);
        canvas.restore();
        line(14, 14, 14, 24);
        line(20, 14, 20, 24);
      case SafeFotoSymbol.link:
        canvas.save();
        canvas.translate(16, 16);
        canvas.rotate(-math.pi / 4);
        box(Rect.fromLTWH(-6, -14 - pulse, 12, 18));
        box(Rect.fromLTWH(-6, -4 + pulse, 12, 18));
        canvas.restore();
      case SafeFotoSymbol.add:
        box(const Rect.fromLTWH(5, 5, 22, 22));
        line(10, 16, 22, 16);
        line(16, 10 - pulse, 16, 22 + pulse);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(SafeFotoIconPainter old) =>
      old.symbol != symbol ||
      old.style != style ||
      old.progress != progress ||
      old.color != color ||
      old.active != active;
}

SafeFotoSymbol? safeFotoActionSymbol(IconData icon) {
  if ([Icons.photo_album_outlined, Icons.photo_album, Icons.add_to_photos_outlined].contains(icon)) {
    return SafeFotoSymbol.album;
  }
  if ([Icons.groups_outlined, Icons.people_outline].contains(icon)) {
    return SafeFotoSymbol.family;
  }
  if ([Icons.share, Icons.share_outlined, Icons.share_rounded, Icons.ios_share_rounded].contains(icon)) {
    return SafeFotoSymbol.share;
  }
  if ([Icons.download, Icons.download_outlined, Icons.file_download_outlined].contains(icon)) {
    return SafeFotoSymbol.download;
  }
  if ([Icons.drive_file_move_outlined].contains(icon)) {
    return SafeFotoSymbol.move;
  }
  if ([Icons.favorite, Icons.favorite_border, Icons.favorite_outline, Icons.favorite_border_rounded].contains(icon)) {
    return SafeFotoSymbol.favorite;
  }
  if ([
    Icons.delete,
    Icons.delete_outline,
    Icons.delete_forever,
    Icons.delete_forever_outlined,
    Icons.delete_outline_rounded,
  ].contains(icon)) {
    return SafeFotoSymbol.trash;
  }
  if ([Icons.link, Icons.link_outlined, Icons.link_rounded].contains(icon)) {
    return SafeFotoSymbol.link;
  }
  if ([Icons.more_horiz, Icons.expand_less].contains(icon)) {
    return SafeFotoSymbol.more;
  }
  return null;
}
