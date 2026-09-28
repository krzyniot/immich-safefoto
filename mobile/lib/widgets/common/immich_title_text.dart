import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';

class ImmichTitleText extends StatelessWidget {
  final double fontSize;
  final Color? color;

  const ImmichTitleText({super.key, this.fontSize = 48, this.color});

  @override
  Widget build(BuildContext context) {
    return Text(
      'SafeFoto',
      semanticsLabel: 'SafeFoto',
      style: TextStyle(
        color: color ?? context.primaryColor,
        fontSize: fontSize,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.5,
      ),
    );
  }
}
