import 'package:flutter/material.dart';
import 'package:immich_mobile/constants/colors.dart';

class ThemeConfig {
  final ThemeMode mode;
  final ImmichColorPreset primaryColor;
  final bool dynamicTheme;
  final bool colorfulInterface;
  final int iconStyle;
  final int backgroundStyle;

  const ThemeConfig({
    this.mode = .dark,
    this.primaryColor = .deepPurple,
    this.dynamicTheme = false,
    this.colorfulInterface = false,
    this.iconStyle = 0,
    this.backgroundStyle = 0,
  });

  ThemeConfig copyWith({
    ThemeMode? mode,
    ImmichColorPreset? primaryColor,
    bool? dynamicTheme,
    bool? colorfulInterface,
    int? iconStyle,
    int? backgroundStyle,
  }) => .new(
    mode: mode ?? this.mode,
    primaryColor: primaryColor ?? this.primaryColor,
    dynamicTheme: dynamicTheme ?? this.dynamicTheme,
    colorfulInterface: colorfulInterface ?? this.colorfulInterface,
    iconStyle: iconStyle ?? this.iconStyle,
    backgroundStyle: backgroundStyle ?? this.backgroundStyle,
  );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ThemeConfig &&
          other.mode == mode &&
          other.primaryColor == primaryColor &&
          other.dynamicTheme == dynamicTheme &&
          other.colorfulInterface == colorfulInterface &&
          other.iconStyle == iconStyle &&
          other.backgroundStyle == backgroundStyle);

  @override
  int get hashCode => Object.hash(mode, primaryColor, dynamicTheme, colorfulInterface, iconStyle, backgroundStyle);

  @override
  String toString() =>
      'ThemeConfig(mode: $mode, primaryColor: $primaryColor, dynamicTheme: $dynamicTheme, colorfulInterface: $colorfulInterface)';
}
