import 'package:flutter/material.dart';

/// Unified toast notification helper.
///
/// Usage:
///   AppToast.error(context, 'Нещо се обърка.');
///   AppToast.success(context, 'Успешно запазено.');
///   AppToast.info(context, 'Данните ще бъдат готови скоро.');
///
/// Form validation errors should stay as inline validators — do NOT use AppToast for them.
class AppToast {
  AppToast._();

  static void error(BuildContext context, String message) =>
      _show(context, message, _Type.error);

  static void success(BuildContext context, String message) =>
      _show(context, message, _Type.success);

  static void info(BuildContext context, String message) =>
      _show(context, message, _Type.info);

  static void _show(BuildContext context, String message, _Type type) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(_build(message, type));
  }

  static SnackBar _build(String message, _Type type) {
    final (bg, accent, icon) = switch (type) {
      _Type.error => (
          const Color(0xFF1C0A0A),
          const Color(0xFFEF4444),
          Icons.error_outline_rounded,
        ),
      _Type.success => (
          const Color(0xFF0A1C10),
          const Color(0xFF10B981),
          Icons.check_circle_outline_rounded,
        ),
      _Type.info => (
          const Color(0xFF0A0F1C),
          const Color(0xFF60A5FA),
          Icons.info_outline_rounded,
        ),
    };

    return SnackBar(
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      backgroundColor: bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: accent.withAlpha(80)),
      ),
      duration: type == _Type.error
          ? const Duration(seconds: 5)
          : const Duration(seconds: 3),
      content: Row(
        children: [
          Icon(icon, color: accent, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum _Type { error, success, info }
