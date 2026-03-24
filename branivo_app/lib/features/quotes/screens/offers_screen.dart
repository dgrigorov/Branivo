import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import '../bloc/quote_bloc.dart';
import '../bloc/quote_event.dart';
import '../bloc/quote_state.dart';
import '../data/quote_api_repository.dart';
import '../widgets/offer_card.dart';
import '../../payments/screens/payment_screen.dart';
import '../../../core/routing/app_router.dart';

class QuoteOffersRouteArgs {
  const QuoteOffersRouteArgs({required this.sessionToken});

  final String sessionToken;
}

enum _OfferFilter { all, cheapest, bestCoverage }

const _kRecommendReason =
    'Балансирана комбинация от цена, рейтинг и скорост на изплащане';

const _storage = FlutterSecureStorage();

class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key, required this.sessionToken});

  final String sessionToken;

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  _OfferFilter _filter = _OfferFilter.all;

  @override
  void initState() {
    super.initState();
    context.read<QuoteBloc>().add(
          QuoteLoadRequestedEvent(sessionToken: widget.sessionToken),
        );
  }

  List<QuoteOffer> _applyFilter(List<QuoteOffer> offers) {
    final available = offers.where((o) => o.status == 'success').toList();
    final unavailable = offers.where((o) => o.status != 'success').toList();

    switch (_filter) {
      case _OfferFilter.cheapest:
        available.sort(
          (a, b) => (a.price ?? double.infinity)
              .compareTo(b.price ?? double.infinity),
        );
      case _OfferFilter.bestCoverage:
        available.sort((a, b) => (b.score ?? 0).compareTo(a.score ?? 0));
      case _OfferFilter.all:
        available.sort((a, b) => (b.score ?? 0).compareTo(a.score ?? 0));
    }

    return [...available, ...unavailable];
  }

  String _filterLabel(_OfferFilter filter) => switch (filter) {
        _OfferFilter.all => 'Всички',
        _OfferFilter.cheapest => 'Най-евтини',
        _OfferFilter.bestCoverage => 'Най-добро покритие',
      };

  Future<void> _onSelectOffer(QuoteOffer offer) async {
    if (offer.price == null) return;

    final paymentArgs = PaymentRouteArgs(
      quoteId: offer.id,
      insurerName: offer.insurerName,
      amount: offer.price!,
      currency: offer.currency,
    );

    final token = await _storage.read(key: 'access_token');
    if (!mounted) return;

    if (token != null && token.isNotEmpty) {
      context.push('/payment', extra: paymentArgs);
    } else {
      context.push(
        '/auth-gate',
        extra: AuthGateRouteArgs(
          redirectPath: '/payment',
          redirectExtra: paymentArgs,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Оферти за застраховка')),
      body: BlocBuilder<QuoteBloc, QuoteState>(
        builder: (context, state) {
          if (state is QuoteInitialState || state is QuoteLoadingState) {
            return _buildSkeleton();
          }

          if (state is QuotePartialState) {
            return _buildWithFilter(state.offers);
          }

          if (state is QuoteLoadedState) {
            if (state.offers.isEmpty) {
              return const Center(
                child: Text('Няма налични оферти в момента.'),
              );
            }
            return _buildWithFilter(state.offers);
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
      ),
    );
  }

  Widget _buildWithFilter(List<QuoteOffer> offers) {
    final filtered = _applyFilter(offers);
    return Column(
      children: [
        _buildFilterChips(),
        Expanded(child: _buildOfferList(filtered)),
      ],
    );
  }

  Widget _buildFilterChips() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          for (final filter in _OfferFilter.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(_filterLabel(filter)),
                selected: _filter == filter,
                onSelected: (_) => setState(() => _filter = filter),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSkeleton() {
    return ListView.builder(
      itemCount: 4,
      itemBuilder: (context, index) => const OfferCardSkeleton(),
    );
  }

  Widget _buildOfferList(List<QuoteOffer> offers) {
    return ListView.builder(
      itemCount: offers.length,
      itemBuilder: (context, i) {
        final offer = offers[i];
        return Semantics(
          label: offer.isRecommended
              ? 'Препоръчана оферта от ${offer.insurerName}'
              : 'Оферта от ${offer.insurerName}',
          child: OfferCard(
            offer: offer,
            isRecommended: offer.isRecommended,
            recommendReason:
                offer.isRecommended ? _kRecommendReason : null,
            onSelect: offer.price == null ? null : () => _onSelectOffer(offer),
          ),
        );
      },
    );
  }
}
