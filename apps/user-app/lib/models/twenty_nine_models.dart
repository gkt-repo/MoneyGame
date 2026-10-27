enum TwentyNinePhase {
  DEAL_1,
  BIDDING,
  TRUMP_SELECTION,
  DEAL_2,
  PLAYING,
  SETTLING,
  COMPLETED,
  CANCELLED,
}

enum CardSuit {
  SPADES,
  HEARTS,
  DIAMONDS,
  CLUBS,
}

enum CardRank {
  SEVEN,
  EIGHT,
  NINE,
  TEN,
  JACK,
  QUEEN,
  KING,
  ACE,
}

class PlayingCardModel {
  final CardSuit suit;
  final CardRank rank;
  final int numericRank;
  final String label;

  PlayingCardModel({
    required this.suit,
    required this.rank,
    int? numericRank,
    String? label,
  })  : numericRank = numericRank ?? _defaultNumericRank(rank),
        label = label ?? _defaultLabel(rank);

  static int _defaultNumericRank(CardRank rank) {
    switch (rank) {
      case CardRank.ACE:
        return 14;
      case CardRank.KING:
        return 13;
      case CardRank.QUEEN:
        return 12;
      case CardRank.JACK:
        return 11;
      case CardRank.TEN:
        return 10;
      case CardRank.NINE:
        return 9;
      case CardRank.EIGHT:
        return 8;
      case CardRank.SEVEN:
        return 7;
    }
  }

  static String _defaultLabel(CardRank rank) {
    switch (rank) {
      case CardRank.ACE:
        return 'A';
      case CardRank.KING:
        return 'K';
      case CardRank.QUEEN:
        return 'Q';
      case CardRank.JACK:
        return 'J';
      case CardRank.TEN:
        return '10';
      case CardRank.NINE:
        return '9';
      case CardRank.EIGHT:
        return '8';
      case CardRank.SEVEN:
        return '7';
    }
  }

  int get points {
    switch (rank) {
      case CardRank.JACK:
        return 3;
      case CardRank.NINE:
        return 2;
      case CardRank.ACE:
      case CardRank.TEN:
        return 1;
      default:
        return 0;
    }
  }

  String get suitSymbol {
    switch (suit) {
      case CardSuit.SPADES:
        return '♠';
      case CardSuit.HEARTS:
        return '♥';
      case CardSuit.DIAMONDS:
        return '♦';
      case CardSuit.CLUBS:
        return '♣';
    }
  }

  String get rankLabel => label;

  bool get isRed => suit == CardSuit.HEARTS || suit == CardSuit.DIAMONDS;

  factory PlayingCardModel.fromJson(Map<String, dynamic> json) {
    final suitStr = (json['suit'] ?? 'SPADES').toString().toUpperCase();
    final suit = CardSuit.values.firstWhere(
      (e) => e.name == suitStr,
      orElse: () => CardSuit.SPADES,
    );

    final rawRank = json['rank'];
    final rawLabel = json['label']?.toString();

    int numRank = 7;
    String lbl = '7';
    CardRank rk = CardRank.SEVEN;

    // Check if rawRank is integer (e.g. 11 for Jack)
    if (rawRank is int) {
      numRank = rawRank;
    } else if (rawRank is String) {
      final parsed = int.tryParse(rawRank);
      if (parsed != null) {
        numRank = parsed;
      } else {
        // String rank like "JACK" or "ACE"
        final rankEnum = CardRank.values.cast<CardRank?>().firstWhere(
          (e) => e?.name.toUpperCase() == rawRank.toUpperCase(),
          orElse: () => null,
        );
        if (rankEnum != null) {
          rk = rankEnum;
          numRank = _defaultNumericRank(rk);
          lbl = _defaultLabel(rk);
        }
      }
    }

    if (rawLabel != null && rawLabel.isNotEmpty) {
      lbl = rawLabel.toUpperCase();
      switch (lbl) {
        case 'A':
          rk = CardRank.ACE;
          numRank = 14;
          break;
        case 'K':
          rk = CardRank.KING;
          numRank = 13;
          break;
        case 'Q':
          rk = CardRank.QUEEN;
          numRank = 12;
          break;
        case 'J':
          rk = CardRank.JACK;
          numRank = 11;
          break;
        case '10':
          rk = CardRank.TEN;
          numRank = 10;
          break;
        case '9':
          rk = CardRank.NINE;
          numRank = 9;
          break;
        case '8':
          rk = CardRank.EIGHT;
          numRank = 8;
          break;
        case '7':
        default:
          rk = CardRank.SEVEN;
          numRank = 7;
          break;
      }
    } else if (rawRank is int || int.tryParse(rawRank?.toString() ?? '') != null) {
      switch (numRank) {
        case 14:
          rk = CardRank.ACE;
          lbl = 'A';
          break;
        case 13:
          rk = CardRank.KING;
          lbl = 'K';
          break;
        case 12:
          rk = CardRank.QUEEN;
          lbl = 'Q';
          break;
        case 11:
          rk = CardRank.JACK;
          lbl = 'J';
          break;
        case 10:
          rk = CardRank.TEN;
          lbl = '10';
          break;
        case 9:
          rk = CardRank.NINE;
          lbl = '9';
          break;
        case 8:
          rk = CardRank.EIGHT;
          lbl = '8';
          break;
        case 7:
        default:
          rk = CardRank.SEVEN;
          lbl = '7';
          break;
      }
    }

    return PlayingCardModel(
      suit: suit,
      rank: rk,
      numericRank: numRank,
      label: lbl,
    );
  }

  Map<String, dynamic> toJson() => {
        'suit': suit.name,
        'rank': numericRank,
        'label': label,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PlayingCardModel &&
          runtimeType == other.runtimeType &&
          suit == other.suit &&
          numericRank == other.numericRank;

  @override
  int get hashCode => suit.hashCode ^ numericRank.hashCode;
}

class TwentyNineTrickCardModel {
  final String userId;
  final PlayingCardModel card;
  final int seatIndex;
  final bool isTrump;

  TwentyNineTrickCardModel({
    required this.userId,
    required this.card,
    required this.seatIndex,
    this.isTrump = false,
  });

  factory TwentyNineTrickCardModel.fromJson(Map<String, dynamic> json) {
    return TwentyNineTrickCardModel(
      userId: json['userId'] ?? '',
      card: PlayingCardModel.fromJson(json['card'] ?? {}),
      seatIndex: json['seatIndex'] ?? 0,
      isTrump: json['isTrump'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'card': card.toJson(),
        'seatIndex': seatIndex,
        'isTrump': isTrump,
      };
}

class TwentyNineTrickModel {
  final int trickNumber;
  final int trickIndex;
  final List<TwentyNineTrickCardModel> cards;
  final CardSuit? leadSuit;
  final String? winnerUserId;
  final int points;

  TwentyNineTrickModel({
    required this.trickNumber,
    required this.trickIndex,
    required this.cards,
    this.leadSuit,
    this.winnerUserId,
    this.points = 0,
  });

  factory TwentyNineTrickModel.fromJson(Map<String, dynamic> json) {
    var rawCards = json['cards'] as List? ?? [];
    final idx = json['trickIndex'] ?? ((json['trickNumber'] as int? ?? 1) - 1);
    return TwentyNineTrickModel(
      trickIndex: idx,
      trickNumber: idx + 1,
      cards: rawCards.map((c) => TwentyNineTrickCardModel.fromJson(c)).toList(),
      leadSuit: json['leadSuit'] != null
          ? CardSuit.values.firstWhere(
              (e) => e.name == json['leadSuit'],
              orElse: () => CardSuit.SPADES,
            )
          : null,
      winnerUserId: json['winnerUserId'],
      points: json['points'] ?? 0,
    );
  }
}

class TwentyNinePlayerStateModel {
  final String userId;
  final String username;
  final String displayName;
  final String avatar;
  final int seatIndex;
  final int teamIndex;
  final int? bid;
  final bool passed;
  final int cardsCount;
  final List<PlayingCardModel> cards;
  final List<PlayingCardModel> legalCards;
  final int capturedPoints;
  final int tricksWon;
  final bool isDisconnected;

  TwentyNinePlayerStateModel({
    required this.userId,
    this.username = '',
    this.displayName = '',
    this.avatar = 'avatar_1',
    required this.seatIndex,
    required this.teamIndex,
    this.bid,
    this.passed = false,
    required this.cardsCount,
    required this.cards,
    this.legalCards = const [],
    this.capturedPoints = 0,
    this.tricksWon = 0,
    this.isDisconnected = false,
  });

  factory TwentyNinePlayerStateModel.fromJson(Map<String, dynamic> json) {
    var rawCards = json['cards'] as List? ?? [];
    var rawLegalCards = json['legalCards'] as List? ?? [];
    final cCount = json['cardCount'] ?? json['cardsCount'] ?? rawCards.length;

    return TwentyNinePlayerStateModel(
      userId: json['userId'] ?? '',
      username: json['username'] ?? '',
      displayName: json['displayName'] ?? json['username'] ?? '',
      avatar: json['avatar'] ?? 'avatar_1',
      seatIndex: json['seatIndex'] ?? 0,
      teamIndex: json['teamIndex'] ?? 0,
      bid: json['bid'],
      passed: json['hasPassedBid'] ?? json['passed'] ?? false,
      cardsCount: cCount,
      cards: rawCards.map((c) => PlayingCardModel.fromJson(c)).toList(),
      legalCards: rawLegalCards.map((c) => PlayingCardModel.fromJson(c)).toList(),
      capturedPoints: json['capturedPoints'] ?? 0,
      tricksWon: json['tricksWon'] ?? 0,
      isDisconnected: json['isDisconnected'] ?? false,
    );
  }
}

class TwentyNineGameStateModel {
  final String roomId;
  final int sequence;
  final TwentyNinePhase phase;
  final String rulesVersion;
  final int dealerSeatIndex;
  final String? currentTurnUserId;
  final int? currentTurnSeatIndex;
  final int? turnExpiresAt;
  final String? highestBidderUserId;
  final int? highestBid;
  final int? highestBidderSeatIndex;

  // Contractor & Auction
  final String? contractorUserId;
  final int? contractorTeamIndex;
  final int? contract;

  // Trump
  final CardSuit? trumpSuit;
  final bool isTrumpRevealed;
  final String? trumpRevealedByUserId;
  final int? trumpRevealedBySeatIndex;
  final int? trumpRevealedAtTrickIndex;
  final bool canRevealTrump;

  // Tricks & Scores
  final int currentTrickIndex;
  final TwentyNineTrickModel? currentTrick;
  final List<TwentyNineTrickModel> completedTricks;
  final int team0Points;
  final int team1Points;

  // Outcome
  final int? winnerTeamIndex;
  final List<String>? winningUserIds;
  final double? winnerPrizePerPlayer;
  final Map<String, double> payouts;
  final String? explanation;

  final Map<String, TwentyNinePlayerStateModel> players;

  TwentyNineGameStateModel({
    this.roomId = '',
    this.sequence = 0,
    required this.phase,
    this.rulesVersion = 'single-deal-v1',
    this.dealerSeatIndex = 0,
    this.currentTurnUserId,
    this.currentTurnSeatIndex,
    this.turnExpiresAt,
    this.highestBidderUserId,
    this.highestBid,
    this.highestBidderSeatIndex,
    this.contractorUserId,
    this.contractorTeamIndex,
    this.contract,
    this.trumpSuit,
    this.isTrumpRevealed = false,
    this.trumpRevealedByUserId,
    this.trumpRevealedBySeatIndex,
    this.trumpRevealedAtTrickIndex,
    this.canRevealTrump = false,
    this.currentTrickIndex = 0,
    this.currentTrick,
    required this.completedTricks,
    this.team0Points = 0,
    this.team1Points = 0,
    this.winnerTeamIndex,
    this.winningUserIds,
    this.winnerPrizePerPlayer,
    this.payouts = const {},
    this.explanation,
    required this.players,
  });

  // Backward-compatible aliases for Flutter table widgets
  String? get bidWinnerUserId => contractorUserId;
  int? get finalContract => contract;
  bool get trumpRevealed => isTrumpRevealed;
  String? get trumpRevealerUserId => trumpRevealedByUserId;
  int? get trumpRevealedInTrick => trumpRevealedAtTrickIndex;
  int get team2Points => team1Points; // Legacy alias: team1Points (team 0) vs team2Points (team 1)
  double? get payoutPerWinner => winnerPrizePerPlayer;
  double payoutFor(String userId) => payouts[userId] ?? winnerPrizePerPlayer ?? 0;

  factory TwentyNineGameStateModel.fromJson(Map<String, dynamic> json) {
    Map<String, TwentyNinePlayerStateModel> parsedPlayers = {};
    if (json['players'] != null && json['players'] is Map) {
      (json['players'] as Map).forEach((k, v) {
        parsedPlayers[k.toString()] = TwentyNinePlayerStateModel.fromJson(v);
      });
    }

    var rawTricks = json['previousTricks'] ?? json['completedTricks'] ?? [];
    List<TwentyNineTrickModel> parsedTricks = [];
    if (rawTricks is List) {
      parsedTricks = rawTricks.map((t) => TwentyNineTrickModel.fromJson(t)).toList();
    }

    final rawPhase = json['phase']?.toString() ?? 'BIDDING';
    final phase = TwentyNinePhase.values.firstWhere(
      (e) => e.name == rawPhase,
      orElse: () => TwentyNinePhase.BIDDING,
    );

    // Contractor & contract resolution
    final contractor = json['contractorUserId'] ?? json['bidWinnerUserId'];
    final contractVal = json['contract'] ?? json['finalContract'];

    // Trump resolution
    final isRevealed = json['isTrumpRevealed'] ?? json['trumpRevealed'] ?? false;
    final revealer = json['trumpRevealedByUserId'] ?? json['trumpRevealerUserId'];
    final revealerTrick = json['trumpRevealedAtTrickIndex'] ?? json['trumpRevealedInTrick'];

    // Scoring resolution: Team 0 & Team 1
    int t0 = 0;
    int t1 = 0;
    if (json.containsKey('team0Points')) {
      t0 = json['team0Points'] ?? 0;
      t1 = json['team1Points'] ?? 0;
    } else {
      // Legacy alias: team1Points (team 0) and team2Points (team 1)
      t0 = json['team1Points'] ?? 0;
      t1 = json['team2Points'] ?? 0;
    }

    final payout = (json['winnerPrizePerPlayer'] ?? json['payoutPerWinner'] as num?)?.toDouble();
    final winTeam = json['winningTeamIndex'] ?? json['winnerTeamIndex'];

    return TwentyNineGameStateModel(
      roomId: json['roomId'] ?? '',
      sequence: json['sequence'] ?? 0,
      phase: phase,
      rulesVersion: json['rulesVersion'] ?? 'single-deal-v1',
      dealerSeatIndex: json['dealerSeatIndex'] ?? 0,
      currentTurnUserId: json['currentTurnUserId'],
      currentTurnSeatIndex: json['currentTurnSeatIndex'],
      turnExpiresAt: json['turnExpiresAt'],
      highestBidderUserId: json['highestBidderUserId'],
      highestBid: json['highestBid'],
      highestBidderSeatIndex: json['highestBidderSeatIndex'],
      contractorUserId: contractor,
      contractorTeamIndex: json['contractorTeamIndex'],
      contract: contractVal,
      trumpSuit: json['trumpSuit'] != null
          ? CardSuit.values.firstWhere(
              (e) => e.name == json['trumpSuit'],
              orElse: () => CardSuit.SPADES,
            )
          : null,
      isTrumpRevealed: isRevealed,
      trumpRevealedByUserId: revealer,
      trumpRevealedBySeatIndex: json['trumpRevealedBySeatIndex'],
      trumpRevealedAtTrickIndex: revealerTrick,
      canRevealTrump: json['canRevealTrump'] ?? false,
      currentTrickIndex: json['currentTrickIndex'] ?? 0,
      currentTrick: json['currentTrick'] != null
          ? TwentyNineTrickModel.fromJson(json['currentTrick'])
          : null,
      completedTricks: parsedTricks,
      team0Points: t0,
      team1Points: t1,
      winnerTeamIndex: winTeam,
      winningUserIds: json['winningUserIds'] != null
          ? List<String>.from(json['winningUserIds'])
          : null,
      winnerPrizePerPlayer: payout,
      payouts: {for (final row in (json['payouts'] as List? ?? [])) row['userId'] as String: (row['amount'] as num).toDouble()},
      explanation: json['explanation'],
      players: parsedPlayers,
    );
  }
}
