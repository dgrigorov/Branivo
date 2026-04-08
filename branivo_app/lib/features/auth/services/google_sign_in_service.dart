import 'package:google_sign_in/google_sign_in.dart';

class GoogleSignInService {
  GoogleSignInService({GoogleSignIn? googleSignIn})
      : _googleSignIn = googleSignIn ?? GoogleSignIn();

  final GoogleSignIn _googleSignIn;

  /// Signs the user in with Google and returns the ID token.
  /// Returns null if the user cancelled the sign-in flow.
  Future<String?> signIn() async {
    final account = await _googleSignIn.signIn();
    if (account == null) return null;
    final auth = await account.authentication;
    return auth.idToken;
  }

  /// Signs the user out of Google (clears cached account).
  Future<void> signOut() => _googleSignIn.signOut();
}
