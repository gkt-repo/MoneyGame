import 'package:flutter/material.dart';

class TeenPattiRulesDialog extends StatelessWidget {
  const TeenPattiRulesDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final rules = [
      {'rank': '1', 'title': 'Trail / Trio / Set', 'desc': 'Three cards of the same rank (e.g. A-A-A, K-K-K). AAA is highest.'},
      {'rank': '2', 'title': 'Pure Sequence / Straight Flush', 'desc': 'Three consecutive cards of the same suit (e.g. A-K-Q♠, A-2-3♥).'},
      {'rank': '3', 'title': 'Sequence / Normal Run', 'desc': 'Three consecutive cards not all in same suit (e.g. A-K-Q, 9-8-7).'},
      {'rank': '4', 'title': 'Color / Flush', 'desc': 'Three cards of the same suit that are not in sequence (e.g. A-K-J♦).'},
      {'rank': '5', 'title': 'Pair', 'desc': 'Two cards of the same rank (e.g. A-A-K, 8-8-J).'},
      {'rank': '6', 'title': 'High Card', 'desc': 'Three cards that do not belong to above categories. Highest card wins.'},
    ];

    return Center(
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 420,
          constraints: const BoxConstraints(maxHeight: 300),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF1E112A),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFFFD54F), width: 1.5),
            boxShadow: const [
              BoxShadow(color: Colors.black87, blurRadius: 20),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    '🃏 Hand Rankings (High to Low)',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFFFFD54F),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white70, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const Divider(color: Colors.white24, height: 8),
              Expanded(
                child: ListView.separated(
                  itemCount: rules.length,
                  separatorBuilder: (ctx, idx) => const Divider(color: Colors.white10, height: 6),
                  itemBuilder: (ctx, i) {
                    final r = rules[i];
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 20,
                          height: 20,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Color(0xFFFFB300),
                          ),
                          child: Center(
                            child: Text(
                              r['rank']!,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF2C1001),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                r['title']!,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                              ),
                              Text(
                                r['desc']!,
                                style: const TextStyle(fontSize: 10, color: Colors.white70),
                              ),
                            ],
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
