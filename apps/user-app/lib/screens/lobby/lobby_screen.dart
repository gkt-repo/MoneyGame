import 'package:flutter/material.dart';
import '../../core/constants/colors.dart';
import '../../core/network/api_client.dart';
import '../../core/network/socket_service.dart';
import '../game/active_room_screen.dart';

class LobbyScreen extends StatefulWidget {
  final UserProfileModel user;
  final VoidCallback onBalanceRefresh;

  const LobbyScreen({
    super.key,
    required this.user,
    required this.onBalanceRefresh,
  });

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  List<RoomModel> _rooms = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchRooms();

    SocketService.on('lobby_rooms_updated', (data) {
      if (mounted && data != null && data is List) {
        setState(() {
          _rooms = data.map((r) => RoomModel.fromJson(r)).toList();
        });
      }
    });
  }

  Future<void> _fetchRooms() async {
    setState(() => _loading = true);
    try {
      final rooms = await ApiClient.getActiveRooms();
      if (mounted) {
        setState(() {
          _rooms = rooms;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _navigateToRoom(String roomId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ActiveRoomScreen(
          roomId: roomId,
          user: widget.user,
        ),
      ),
    ).then((_) {
      _fetchRooms();
      widget.onBalanceRefresh();
    });
  }

  void _showCreateTableModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _CreateTableBottomSheet(
        user: widget.user,
        onRoomCreated: (room) {
          Navigator.of(ctx).pop();
          _navigateToRoom(room.id);
        },
      ),
    );
  }

  void _showJoinCodeModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _JoinCodeBottomSheet(
        user: widget.user,
        onRoomJoined: (room) {
          Navigator.of(ctx).pop();
          _navigateToRoom(room.id);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      body: RefreshIndicator(
        onRefresh: () async {
          await _fetchRooms();
          widget.onBalanceRefresh();
        },
        color: AppColors.emerald600,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Action Buttons (Create Table & Join Code)
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _showCreateTableModal,
                            icon: const Icon(Icons.add_circle_outline, size: 18, color: AppColors.white),
                            label: const Text(
                              'Create Table',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.white),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.emerald600,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _showJoinCodeModal,
                            icon: const Icon(Icons.tag, size: 18, color: AppColors.slate800),
                            label: const Text(
                              'Join Code',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.slate800),
                            ),
                            style: OutlinedButton.styleFrom(
                              backgroundColor: AppColors.white,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              side: const BorderSide(color: AppColors.slate200),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Section Heading
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'ACTIVE TABLES',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                            color: AppColors.slate500,
                          ),
                        ),
                        Text(
                          '${_rooms.length} Online',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.emerald600),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            if (_loading && _rooms.isEmpty)
              const SliverFillRemaining(
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.emerald600),
                ),
              )
            else if (_error != null && _rooms.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 36, color: AppColors.red600),
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: AppColors.slate600)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _fetchRooms,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald600),
                        child: const Text('Retry', style: TextStyle(color: AppColors.white)),
                      )
                    ],
                  ),
                ),
              )
            else if (_rooms.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            color: AppColors.slate100,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.casino_outlined, size: 28, color: AppColors.slate400),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'No Active Tables',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Create a new table or invite a player with a room code to get started.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: AppColors.slate500),
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          onPressed: _showCreateTableModal,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.slate900,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          child: const Text('Create First Table', style: TextStyle(color: AppColors.white)),
                        )
                      ],
                    ),
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final room = _rooms[index];
                      return _buildRoomCard(room);
                    },
                    childCount: _rooms.length,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoomCard(RoomModel room) {
    final isPlayerInRoom = room.players.any((p) => p.userId == widget.user.id);
    final isFull = room.players.length >= room.maxPlayers;
    final totalPot = room.entryFee * room.maxPlayers;
    final winnerPrize = totalPot * 0.90;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isPlayerInRoom ? AppColors.emerald600 : AppColors.slate200,
          width: isPlayerInRoom ? 1.5 : 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            if (isPlayerInRoom) {
              _navigateToRoom(room.id);
            } else if (!isFull) {
              _showQuickJoinDialog(room);
            }
          },
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Text(
                          '#${room.roomCode}',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppColors.slate900,
                          ),
                        ),
                        if (isPlayerInRoom) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.emerald100,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'JOINED',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.emerald800),
                            ),
                          ),
                        ],
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: room.status == 'WAITING' ? AppColors.emerald50 : AppColors.amber50,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        room.status,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: room.status == 'WAITING' ? AppColors.emerald700 : AppColors.amber800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Table Stats Row
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'ENTRY STAKE',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.slate400),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '₹${room.entryFee.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: AppColors.slate900,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'POT PRIZE',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.slate400),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '₹${winnerPrize.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: AppColors.emerald600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'OCCUPANCY',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.slate400),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${room.players.length} / ${room.maxPlayers} Players',
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.slate700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Button CTA
                SizedBox(
                  width: double.infinity,
                  height: 38,
                  child: ElevatedButton(
                    onPressed: isPlayerInRoom
                        ? () => _navigateToRoom(room.id)
                        : isFull
                            ? null
                            : () => _showQuickJoinDialog(room),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isPlayerInRoom ? AppColors.slate900 : AppColors.emerald600,
                      disabledBackgroundColor: AppColors.slate100,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: Text(
                      isPlayerInRoom
                          ? 'Enter Active Room'
                          : isFull
                              ? 'Room Full'
                              : 'Join Table (₹${room.entryFee.toStringAsFixed(0)})',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: isFull && !isPlayerInRoom ? AppColors.slate400 : AppColors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showQuickJoinDialog(RoomModel room) {
    int chosenNumber = 1;
    final takenNumbers = room.players.map((p) => p.guessNumber).toSet();

    for (int i = 1; i <= 10; i++) {
      if (!takenNumbers.contains(i)) {
        chosenNumber = i;
        break;
      }
    }

    bool joining = false;
    String? joinError;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: AppColors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            title: Text(
              'Join Table #${room.roomCode}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.slate900),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Entry Fee: ₹${room.entryFee.toStringAsFixed(0)} (Balance: ₹${widget.user.balance.toStringAsFixed(2)})',
                  style: const TextStyle(fontSize: 13, color: AppColors.slate600),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Choose Your Lucky Number (1-10):',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate900),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: List.generate(10, (idx) {
                    final numVal = idx + 1;
                    final isTaken = takenNumbers.contains(numVal);
                    final isSelected = chosenNumber == numVal;

                    return ChoiceChip(
                      label: Text('$numVal'),
                      selected: isSelected,
                      onSelected: isTaken
                          ? null
                          : (sel) {
                              if (sel) setDialogState(() => chosenNumber = numVal);
                            },
                      backgroundColor: isTaken ? AppColors.slate100 : AppColors.white,
                      selectedColor: AppColors.emerald50,
                      labelStyle: TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                        color: isTaken
                            ? AppColors.slate400
                            : isSelected
                                ? AppColors.emerald700
                                : AppColors.slate900,
                      ),
                      side: BorderSide(
                        color: isSelected ? AppColors.emerald600 : AppColors.slate200,
                      ),
                    );
                  }),
                ),
                if (joinError != null) ...[
                  const SizedBox(height: 12),
                  Text(joinError!, style: const TextStyle(color: AppColors.red600, fontSize: 12)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Cancel', style: TextStyle(color: AppColors.slate500)),
              ),
              ElevatedButton(
                onPressed: joining
                    ? null
                    : () async {
                        setDialogState(() {
                          joining = true;
                          joinError = null;
                        });
                        try {
                          final joinedRoom = await ApiClient.joinRoom(
                            userId: widget.user.id,
                            roomCode: room.roomCode,
                            guessNumber: chosenNumber,
                          );
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          _navigateToRoom(joinedRoom.id);
                        } catch (e) {
                          setDialogState(() {
                            joining = false;
                            joinError = e.toString();
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.emerald600,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                ),
                child: const Text('Confirm & Join', style: TextStyle(color: AppColors.white)),
              ),
            ],
          );
        },
      ),
    );
  }
}

// Bottom sheet for Creating Table
class _CreateTableBottomSheet extends StatefulWidget {
  final UserProfileModel user;
  final Function(RoomModel room) onRoomCreated;

  const _CreateTableBottomSheet({required this.user, required this.onRoomCreated});

  @override
  State<_CreateTableBottomSheet> createState() => _CreateTableBottomSheetState();
}

class _CreateTableBottomSheetState extends State<_CreateTableBottomSheet> {
  double _entryFee = 50;
  int _maxPlayers = 2;
  int _chosenNumber = 7;
  bool _submitting = false;
  String? _error;

  final List<double> _stakes = [10, 25, 50, 100, 200, 500];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Create New Table',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: AppColors.red50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
              ),
              child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
            ),
          ],

          // Entry Stake
          const Text(
            'Select Entry Stake (₹)',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: _stakes.map((stake) {
              final isSel = _entryFee == stake;
              return ChoiceChip(
                label: Text('₹${stake.toStringAsFixed(0)}'),
                selected: isSel,
                onSelected: (selected) {
                  if (selected) setState(() => _entryFee = stake);
                },
                backgroundColor: AppColors.white,
                selectedColor: AppColors.emerald50,
                labelStyle: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: isSel ? AppColors.emerald700 : AppColors.slate800,
                ),
                side: BorderSide(color: isSel ? AppColors.emerald600 : AppColors.slate200),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          // Player Count
          const Text(
            'Max Players',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          Row(
            children: [2, 3, 4].map((count) {
              final isSel = _maxPlayers == count;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text('$count Players'),
                  selected: isSel,
                  onSelected: (selected) {
                    if (selected) setState(() => _maxPlayers = count);
                  },
                  backgroundColor: AppColors.white,
                  selectedColor: AppColors.emerald50,
                  labelStyle: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isSel ? AppColors.emerald700 : AppColors.slate800,
                  ),
                  side: BorderSide(color: isSel ? AppColors.emerald600 : AppColors.slate200),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          // Secret Guess Number
          const Text(
            'Your Number (1-10)',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: List.generate(10, (idx) {
              final val = idx + 1;
              final isSel = _chosenNumber == val;
              return ChoiceChip(
                label: Text('$val'),
                selected: isSel,
                onSelected: (selected) {
                  if (selected) setState(() => _chosenNumber = val);
                },
                backgroundColor: AppColors.white,
                selectedColor: AppColors.emerald50,
                labelStyle: TextStyle(
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w700,
                  color: isSel ? AppColors.emerald700 : AppColors.slate900,
                ),
                side: BorderSide(color: isSel ? AppColors.emerald600 : AppColors.slate200),
              );
            }),
          ),
          const SizedBox(height: 24),

          // Submit Button
          SizedBox(
            width: double.infinity,
            height: 46,
            child: ElevatedButton(
              onPressed: _submitting
                  ? null
                  : () async {
                      if (_entryFee > widget.user.balance) {
                        setState(() => _error = 'Insufficient balance (Available: ₹${widget.user.balance.toStringAsFixed(2)})');
                        return;
                      }

                      setState(() {
                        _submitting = true;
                        _error = null;
                      });

                      try {
                        final room = await ApiClient.createRoom(
                          userId: widget.user.id,
                          entryFee: _entryFee,
                          maxPlayers: _maxPlayers,
                          guessNumber: _chosenNumber,
                        );
                        widget.onRoomCreated(room);
                      } catch (e) {
                        setState(() {
                          _submitting = false;
                          _error = e.toString();
                        });
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.emerald600,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: _submitting
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                  : Text(
                      'Lock ₹${_entryFee.toStringAsFixed(0)} & Host Table',
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.white),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// Bottom sheet for Joining via Code
class _JoinCodeBottomSheet extends StatefulWidget {
  final UserProfileModel user;
  final Function(RoomModel room) onRoomJoined;

  const _JoinCodeBottomSheet({required this.user, required this.onRoomJoined});

  @override
  State<_JoinCodeBottomSheet> createState() => _JoinCodeBottomSheetState();
}

class _JoinCodeBottomSheetState extends State<_JoinCodeBottomSheet> {
  final _codeController = TextEditingController();
  int _chosenNumber = 5;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Join via Room Code',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.slate900),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20, color: AppColors.slate500),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: AppColors.red50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.red600.withValues(alpha: 0.3)),
              ),
              child: Text(_error!, style: const TextStyle(fontSize: 12, color: AppColors.red600)),
            ),
          ],

          // Room Code Input
          const Text(
            'Room Code',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _codeController,
            textCapitalization: TextCapitalization.characters,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
            ),
            decoration: InputDecoration(
              hintText: 'e.g. R-1234',
              hintStyle: const TextStyle(fontSize: 14, color: AppColors.slate400, letterSpacing: 0),
              filled: true,
              fillColor: AppColors.slate50,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: AppColors.slate200),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Secret Guess Number
          const Text(
            'Pick Your Number (1-10)',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate900),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: List.generate(10, (idx) {
              final val = idx + 1;
              final isSel = _chosenNumber == val;
              return ChoiceChip(
                label: Text('$val'),
                selected: isSel,
                onSelected: (selected) {
                  if (selected) setState(() => _chosenNumber = val);
                },
                backgroundColor: AppColors.white,
                selectedColor: AppColors.emerald50,
                labelStyle: TextStyle(
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w700,
                  color: isSel ? AppColors.emerald700 : AppColors.slate900,
                ),
                side: BorderSide(color: isSel ? AppColors.emerald600 : AppColors.slate200),
              );
            }),
          ),
          const SizedBox(height: 24),

          // Submit Button
          SizedBox(
            width: double.infinity,
            height: 46,
            child: ElevatedButton(
              onPressed: _submitting
                  ? null
                  : () async {
                      final code = _codeController.text.trim();
                      if (code.isEmpty) {
                        setState(() => _error = 'Please enter a valid room code');
                        return;
                      }

                      setState(() {
                        _submitting = true;
                        _error = null;
                      });

                      try {
                        final room = await ApiClient.joinRoom(
                          userId: widget.user.id,
                          roomCode: code,
                          guessNumber: _chosenNumber,
                        );
                        widget.onRoomJoined(room);
                      } catch (e) {
                        setState(() {
                          _submitting = false;
                          _error = e.toString();
                        });
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.emerald600,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: _submitting
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white))
                  : const Text(
                      'Join Table',
                      style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.white),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
