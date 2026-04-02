import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import '../bloc/quote_bloc.dart';
import '../bloc/quote_event.dart';
import '../bloc/quote_state.dart';
import '../data/quote_api_repository.dart';
import '../widgets/offer_card.dart';
import '../screens/installment_selection_screen.dart';
import '../../../core/routing/app_router.dart';

class QuoteOffersRouteArgs {
  const QuoteOffersRouteArgs({required this.sessionToken});

  final String sessionToken;
}

enum _InstallmentTab { single, two, four }

extension _InstallmentTabExt on _InstallmentTab {
  String get label => switch (this) {
        _InstallmentTab.single => 'ЕДНОКРАТНО',
        _InstallmentTab.two => '2 ВНОСКИ',
        _InstallmentTab.four => '4 ВНОСКИ',
      };

  int get count => switch (this) {
        _InstallmentTab.single => 1,
        _InstallmentTab.two => 2,
        _InstallmentTab.four => 4,
      };
}

const _storage = FlutterSecureStorage();

class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key, required this.sessionToken});

  final String sessionToken;

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  _InstallmentTab _selectedTab = _InstallmentTab.single;

  @override
  void initState() {
    super.initState();
    context.read<QuoteBloc>().add(
          QuoteLoadRequestedEvent(sessionToken: widget.sessionToken),
        );
  }

  List<QuoteOffer> _sortedOffers(List<QuoteOffer> offers) {
    final available = offers.where((o) => o.status == 'success').toList()
      ..sort((a, b) {
        final aPrice = a.optionFor(_selectedTab.count)?.totalBgn ??
            a.price ??
            double.infinity;
        final bPrice = b.optionFor(_selectedTab.count)?.totalBgn ??
            b.price ??
            double.infinity;
        return aPrice.compareTo(bPrice);
      });
    final unavailable = offers.where((o) => o.status != 'success').toList();
    return [...available, ...unavailable];
  }

  Future<void> _onSelectOffer(QuoteOffer offer) async {
    final token = await _storage.read(key: 'access_token');
    if (!mounted) return;

    final args = InstallmentSelectionRouteArgs(
      offer: offer,
      initialInstallmentCount: _selectedTab.count,
    );

    if (token != null && token.isNotEmpty) {
      context.push('/quotes/installment-selection', extra: args);
    } else {
      context.push(
        '/auth-gate',
        extra: AuthGateRouteArgs(
          redirectPath: '/quotes/installment-selection',
          redirectExtra: args,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.primary,
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Colors.white,
        title: const Text(
          'ГРАЖДАНСКА ОТГОВОРНОСТ',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 16,
            letterSpacing: 0.5,
          ),
        ),
        centerTitle: true,
        elevation: 0,
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              margin: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(20)),
                child: _buildBody(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    return BlocBuilder<QuoteBloc, QuoteState>(
      builder: (context, state) {
        if (state is QuoteInitialState || state is QuoteLoadingState) {
          return _buildLoadingContent();
        }

        if (state is QuotePartialState) {
          return _buildContent(state.offers);
        }

        if (state is QuoteLoadedState) {
          if (state.offers.isEmpty) {
            return const Center(
              child: Text('Няма налични оферти в момента.'),
            );
          }
          return _buildContent(state.offers);
        }

        if (state is QuoteErrorState) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Грешка при зареждане на оферти: ${state.message}',
                textAlign: TextAlign.center,
              ),
            ),
          );
        }

        return const SizedBox.shrink();
      },
    );
  }

  Widget _buildLoadingContent() {
    return Column(
      children: [
        _buildHeader(),
        _buildTabSwitcher(),
        const SizedBox(height: 8),
        Expanded(
          child: ListView.builder(
            itemCount: 4,
            itemBuilder: (_, _) => const OfferCardSkeleton(),
          ),
        ),
      ],
    );
  }

  Widget _buildContent(List<QuoteOffer> offers) {
    final sorted = _sortedOffers(offers);
    return Column(
      children: [
        _buildHeader(),
        _buildTabSwitcher(),
        const SizedBox(height: 8),
        Expanded(
          child: ListView.separated(
            padding: EdgeInsets.zero,
            itemCount: sorted.length,
            separatorBuilder: (_, _) => const Divider(height: 1, indent: 16),
            itemBuilder: (context, i) {
              final offer = sorted[i];
              return OfferCard(
                offer: offer,
                isRecommended: offer.isRecommended,
                selectedInstallmentCount: _selectedTab.count,
                onSelect: offer.status == 'success'
                    ? () => _onSelectOffer(offer)
                    : null,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: [
          Text(
            'ОФЕРТИ',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: Theme.of(context).colorScheme.primary,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Сравнете и изберете най-добрата оферта',
            style: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabSwitcher() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      height: 44,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: _InstallmentTab.values.map((tab) {
          final isSelected = _selectedTab == tab;
          return Expanded(
            child: GestureDetector(
              onTap: () => setState(() => _selectedTab = tab),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                decoration: BoxDecoration(
                  color: isSelected
                      ? Theme.of(context).colorScheme.primary
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(22),
                ),
                child: Center(
                  child: Text(
                    tab.label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isSelected
                          ? Colors.white
                          : Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withValues(alpha: 0.6),
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
