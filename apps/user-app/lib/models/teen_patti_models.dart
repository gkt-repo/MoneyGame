enum CardSuit {
  hearts,
  diamonds,
  clubs,
  spades;

  static CardSuit fromString(String val) {
    switch (val.toUpperCase()) {
      case 'HEARTS':
        return CardSuit.hearts;
      case 'DIAMONDS':
        return CardSuit.diamonds;
      case 'CLUBS':
        return CardSuit.clubs;
      case 'SPADES':
      default:
        return CardSuit.spades;
    }
  }

  String get symbol {
    switch (this) {
      case CardSuit.hearts:
        return '♥';
      case CardSuit.diamonds:
        return '♦';
      case CardSuit.clubs:
        return '♣';
      case CardSuit.spades:
        return '♠';
    }
  }

  bool get isRed => this == CardSuit.hearts || this == CardSuit.diamonds;
}

class PlayingCardModel {
  final CardSuit suit;
  final int rank; // 2..14 (14 = Ace)
  final String label;

  const PlayingCardModel({
    required this.suit,
    required this.rank,
    required this.label,
  });

  factory PlayingCardModel.fromJson(Map<String, dynamic> json) {
    return PlayingCardModel(
      suit: CardSuit.fromString(json['suit']?.toString() ?? 'SPADES'),
      rank: (json['rank'] as num?)?.toInt() ?? 2,
      label: json['label']?.toString() ?? '2',
    );
  }

  Map<String, dynamic> toJson() => {
        'suit': suit.name.toUpperCase(),
        'rank': rank,
        'label': label,
      };

  bool get isRed => suit.isRed;
  String get symbol => suit.symbol;
}

class TeenPattiHandResultModel {
  final String type; // TRAIL, PURE_SEQUENCE, SEQUENCE, COLOR, PAIR, HIGH_CARD
  final int score;
  final String description;
  final List<PlayingCardModel> sortedCards;

  const TeenPattiHandResultModel({
    required this.type,
    required this.score,
    required this.description,
    required this.sortedCards,
  });

  factory TeenPattiHandResultModel.fromJson(Map<String, dynamic> json) {
    final rawCards = json['sortedCards'] as List? ?? [];
    return TeenPattiHandResultModel(
      type: json['type']?.toString() ?? 'HIGH_CARD',
      score: (json['score'] as num?)?.toInt() ?? 0,
      description: json['description']?.toString() ?? '',
      sortedCards: rawCards.map((c) => PlayingCardModel.fromJson(Map<String, dynamic>.from(c))).toList(),
    );
  }

  String get displayTitle {
    switch (type.toUpperCase()) {
      case 'TRAIL':
        return 'TRAIL / SET (TRIO)';
      case 'PURE_SEQUENCE':
        return 'PURE SEQUENCE (STRAIGHT FLUSH)';
      case 'SEQUENCE':
        return 'SEQUENCE (STRAIGHT)';
      case 'COLOR':
        return 'COLOR (FLUSH)';
      case 'PAIR':
        return 'PAIR';
      case 'HIGH_CARD':
      default:
        return 'HIGH CARD';
    }
  }
}

class TeenPattiPlayerModel {
  final String userId;
  final String username;
  final int seatIndex;
  final List<PlayingCardModel>? cards;
  final bool isSeen;
  final bool isPacked;
  final double totalBet;
  final String? lastAction;

  const TeenPattiPlayerModel({
    required this.userId,
    required this.username,
    required this.seatIndex,
    this.cards,
    this.isSeen = false,
    this.isPacked = false,
    this.totalBet = 0.0,
    this.lastAction,
  });

  factory TeenPattiPlayerModel.fromJson(Map<String, dynamic> json) {
    List<PlayingCardModel>? cardList;
    if (json['cards'] != null && json['cards'] is List) {
      cardList = (json['cards'] as List)
          .map((c) => PlayingCardModel.fromJson(Map<String, dynamic>.from(c)))
          .toList();
    }

    return TeenPattiPlayerModel(
      userId: json['userId']?.toString() ?? '',
      username: json['username']?.toString() ?? 'Player',
      seatIndex: (json['seatIndex'] as num?)?.toInt() ?? 0,
      cards: cardList,
      isSeen: json['isSeen'] == true,
      isPacked: json['isPacked'] == true,
      totalBet: (json['totalBet'] as num?)?.toDouble() ?? 0.0,
      lastAction: json['lastAction']?.toString(),
    );
  }

  TeenPattiPlayerModel copyWith({
    String? userId,
    String? username,
    int? seatIndex,
    List<PlayingCardModel>? cards,
    bool? isSeen,
    bool? isPacked,
    double? totalBet,
    String? lastAction,
  }) {
    return TeenPattiPlayerModel(
      userId: userId ?? this.userId,
      username: username ?? this.username,
      seatIndex: seatIndex ?? this.seatIndex,
      cards: cards ?? this.cards,
      isSeen: isSeen ?? this.isSeen,
      isPacked: isPacked ?? this.isPacked,
      totalBet: totalBet ?? this.totalBet,
      lastAction: lastAction ?? this.lastAction,
    );
  }
}

class TeenPattiGameStateModel {
  final double pot;
  final double bootAmount;
  final double currentChaalAmount;
  final String? currentTurnUserId;
  final int? turnExpiresAt;
  final int roundNumber;
  final Map<String, TeenPattiPlayerModel> players;

  const TeenPattiGameStateModel({
    required this.pot,
    required this.bootAmount,
    required this.currentChaalAmount,
    this.currentTurnUserId,
    this.turnExpiresAt,
    this.roundNumber = 1,
    required this.players,
  });

  factory TeenPattiGameStateModel.fromJson(Map<String, dynamic> json) {
    final rawPlayers = json['players'];
    final Map<String, TeenPattiPlayerModel> parsedPlayers = {};

    if (rawPlayers is Map) {
      rawPlayers.forEach((key, val) {
        if (val is Map) {
          parsedPlayers[key.toString()] =
              TeenPattiPlayerModel.fromJson(Map<String, dynamic>.from(val));
        }
      });
    } else if (rawPlayers is List) {
      for (final p in rawPlayers) {
        if (p is Map) {
          final model = TeenPattiPlayerModel.fromJson(Map<String, dynamic>.from(p));
          parsedPlayers[model.userId] = model;
        }
      }
    }

    return TeenPattiGameStateModel(
      pot: (json['pot'] as num?)?.toDouble() ?? 0.0,
      bootAmount: (json['bootAmount'] as num?)?.toDouble() ?? 10.0,
      currentChaalAmount: (json['currentChaalAmount'] as num?)?.toDouble() ?? 10.0,
      currentTurnUserId: json['currentTurnUserId']?.toString(),
      turnExpiresAt: (json['turnExpiresAt'] as num?)?.toInt(),
      roundNumber: (json['roundNumber'] as num?)?.toInt() ?? 1,
      players: parsedPlayers,
    );
  }

  TeenPattiGameStateModel copyWith({
    double? pot,
    double? bootAmount,
    double? currentChaalAmount,
    String? currentTurnUserId,
    int? turnExpiresAt,
    int? roundNumber,
    Map<String, TeenPattiPlayerModel>? players,
  }) {
    return TeenPattiGameStateModel(
      pot: pot ?? this.pot,
      bootAmount: bootAmount ?? this.bootAmount,
      currentChaalAmount: currentChaalAmount ?? this.currentChaalAmount,
      currentTurnUserId: currentTurnUserId ?? this.currentTurnUserId,
      turnExpiresAt: turnExpiresAt ?? this.turnExpiresAt,
      roundNumber: roundNumber ?? this.roundNumber,
      players: players ?? this.players,
    );
  }
}

class ShowdownEntryModel {
  final String userId;
  final String username;
  final List<PlayingCardModel> cards;
  final TeenPattiHandResultModel? handResult;

  const ShowdownEntryModel({
    required this.userId,
    required this.username,
    required this.cards,
    this.handResult,
  });

  factory ShowdownEntryModel.fromJson(Map<String, dynamic> json) {
    final rawCards = json['cards'] as List? ?? [];
    return ShowdownEntryModel(
      userId: json['userId']?.toString() ?? '',
      username: json['username']?.toString() ?? 'Player',
      cards: rawCards.map((c) => PlayingCardModel.fromJson(Map<String, dynamic>.from(c))).toList(),
      handResult: json['handResult'] != null
          ? TeenPattiHandResultModel.fromJson(Map<String, dynamic>.from(json['handResult']))
          : null,
    );
  }
}

class GameFinishedModel {
  final String winnerId;
  final String winnerUsername;
  final double prizePool;
  final double winnerPrize;
  final String? reason;
  final List<ShowdownEntryModel> showdown;

  const GameFinishedModel({
    required this.winnerId,
    required this.winnerUsername,
    required this.prizePool,
    required this.winnerPrize,
    this.reason,
    required this.showdown,
  });

  factory GameFinishedModel.fromJson(Map<String, dynamic> json) {
    final rawShowdown = json['showdown'] as List? ?? [];
    return GameFinishedModel(
      winnerId: json['winnerId']?.toString() ?? '',
      winnerUsername: json['winnerUsername']?.toString() ?? 'Winner',
      prizePool: (json['prizePool'] as num?)?.toDouble() ?? 0.0,
      winnerPrize: (json['winnerPrize'] as num?)?.toDouble() ??
          ((json['prizePool'] as num?)?.toDouble() ?? 0.0) * 0.9,
      reason: json['reason']?.toString(),
      showdown: rawShowdown
          .map((s) => ShowdownEntryModel.fromJson(Map<String, dynamic>.from(s)))
          .toList(),
    );
  }
}

// Client-side quick hand evaluator so when user sees cards, we immediately detect the hand rank
class TeenPattiEvaluator {
  static String evaluateHandName(List<PlayingCardModel> cards) {
    if (cards.length != 3) return '';

    final sorted = List<PlayingCardModel>.from(cards)..sort((a, b) => b.rank.compareTo(a.rank));

    final r1 = sorted[0].rank;
    final r2 = sorted[1].rank;
    final r3 = sorted[2].rank;

    final isSameSuit = sorted[0].suit == sorted[1].suit && sorted[1].suit == sorted[2].suit;

    // Trail / Trio
    if (r1 == r2 && r2 == r3) {
      return 'Trail (${sorted[0].label})';
    }

    // Sequence (A-2-3 is special: 14, 3, 2)
    final isA23 = r1 == 14 && r2 == 3 && r3 == 2;
    final isNormalSeq = (r1 - r2 == 1) && (r2 - r3 == 1);
    final isSeq = isNormalSeq || isA23;

    if (isSeq && isSameSuit) {
      return 'Pure Sequence';
    }

    if (isSeq) {
      return 'Sequence (Run)';
    }

    if (isSameSuit) {
      return 'Color (Flush)';
    }

    // Pair
    if (r1 == r2 || r2 == r3 || r1 == r3) {
      final pairLabel = (r1 == r2 || r1 == r3) ? sorted[0].label : sorted[1].label;
      return 'Pair of ${pairLabel}s';
    }

    return 'High Card (${sorted[0].label})';
  }
}
