import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/constants/colors.dart';
import 'core/constants/app_theme.dart';
import 'core/services/theme_preferences.dart';
import 'core/constants/api_constants.dart';
import 'core/network/api_client.dart';
import 'core/storage/secure_storage_service.dart';
import 'core/services/display_mode_service.dart';
import 'core/services/room_invitations.dart';
import 'screens/auth/auth_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Force 120 FPS / 120 Hz display refresh rate by default
  await DisplayModeService.force120Hz();

  // Set standard status bar colors
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  final savedUrl = await SecureStorageService.getCustomBaseUrl();
  if (savedUrl != null && savedUrl.isNotEmpty) {
    ApiConstants.setRuntimeUrl(savedUrl);
  }

  await ThemePreferences.instance.load();

  ApiClient.init();

  runApp(const MoneyGameUserApp());
}

class MoneyGameUserApp extends StatefulWidget {
  const MoneyGameUserApp({super.key});

  @override
  State<MoneyGameUserApp> createState() => _MoneyGameUserAppState();
}

class _MoneyGameUserAppState extends State<MoneyGameUserApp>
    with WidgetsBindingObserver {
  UserProfileModel? _currentUser;
  bool _initializing = true;
  final _navigatorKey = GlobalKey<NavigatorState>();
  String? _pendingInvitation;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pendingInvitation = RoomInvitations.targetFromLink(
      WidgetsBinding.instance.platformDispatcher.defaultRouteName,
    );
    DisplayModeService.force120Hz();
    _checkSavedSession();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      DisplayModeService.force120Hz();
    }
  }

  @override
  Future<bool> didPushRouteInformation(
    RouteInformation routeInformation,
  ) async {
    final target = RoomInvitations.targetFromLink(
      routeInformation.uri.toString(),
    );
    if (target == null)
      return true; // Ignore unsupported links without routing them.
    _navigatorKey.currentState?.popUntil((route) => route.isFirst);
    setState(() => _pendingInvitation = target);
    return true;
  }

  Future<void> _checkSavedSession() async {
    try {
      final savedUrl = await SecureStorageService.getCustomBaseUrl();
      if (savedUrl != null && savedUrl.isNotEmpty) {
        ApiConstants.setRuntimeUrl(savedUrl);
      }
      final token = await SecureStorageService.getAccessToken();
      if (token != null && token.isNotEmpty) {
        final profile = await ApiClient.getMe();
        if (mounted) {
          setState(() {
            _currentUser = profile;
            _initializing = false;
          });
          return;
        }
      }
    } catch (_) {
      await SecureStorageService.clearSession();
    }

    if (mounted) {
      setState(() {
        _currentUser = null;
        _initializing = false;
      });
    }
  }

  void _onAuthSuccess(UserProfileModel user) {
    setState(() {
      _currentUser = user;
    });
  }

  void _onLogout() {
    setState(() {
      _currentUser = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemePreferences.instance,
      builder: (context, mode, child) => MaterialApp(
        themeMode: mode,
        darkTheme: AppTheme.dark,
        navigatorKey: _navigatorKey,
        // Invitations wait for authentication rather than creating a second root.
        initialRoute: '/',
        title: 'MoneyGame',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: _initializing
            ? const Scaffold(
                body: Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.emerald600,
                  ),
                ),
              )
            : _currentUser != null
            ? HomeScreen(
                user: _currentUser!,
                onLogout: _onLogout,
                pendingInvitation: _pendingInvitation,
                onInvitationOpened: () =>
                    setState(() => _pendingInvitation = null),
              )
            : AuthScreen(onAuthSuccess: _onAuthSuccess),
      ),
    );
  }
}
