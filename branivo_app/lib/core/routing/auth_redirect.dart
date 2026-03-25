/// Пренася redirect информация от auth gate → Login/Registration,
/// за да може потребителят да се върне към плащането след вход.
class AuthRedirect {
  const AuthRedirect({
    required this.path,
    this.extra,
  });

  final String path;
  final Object? extra;
}
