"""
yjs_sync.py - Clean abstraction for syncing data to Yjs documents

This module encapsulates all Yjs-specific logic, keeping the rest of the
codebase clean and focused on business logic.

Design principle: Backend Datastore is source of truth, Yjs is real-time cache.
"""

import logging
from typing import Optional
from y_py import YMap

logger = logging.getLogger(__name__)


class YjsSync:
    """
    Handles synchronization of data into Yjs documents.
    Encapsulates all Yjs-specific details (nested Y.Maps, transactions, etc.)
    """

    def __init__(self, yjs_server):
        """
        Initialize YjsSync with a reference to the Yjs server.

        Args:
            yjs_server: The WebsocketServer instance managing Yjs rooms
        """
        self.yjs_server = yjs_server

    async def sync_card_to_sheet(
        self,
        sheet_id: str,
        card_id: str,
        card_data: dict
    ) -> bool:
        """
        Sync a card to a sheet's Yjs document.

        Creates or updates a card in the cardsMetadata Y.Map with proper
        nested Y.Map structure for granular updates.

        Args:
            sheet_id: Sheet/room identifier (e.g., "test-sheet-1")
            card_id: Unique card identifier
            card_data: Plain dict with card fields. Common fields:
                - title: str
                - color: str (hex color)
                - prompt: str
                - media_url: str (optional)
                - thumb_url: str (optional)
                - media_type: str (optional, "image" or "video")
                - number: int (optional)

        Returns:
            True if successful, False otherwise

        Example:
            await yjs_sync.sync_card_to_sheet(
                sheet_id="test-sheet-1",
                card_id="card-abc123",
                card_data={
                    'title': 'My Card',
                    'color': '#FF6B6B',
                    'media_url': 'https://example.com/image.png'
                }
            )
        """
        try:
            # Get the room (creates if doesn't exist)
            room_name = f"/yjs/{sheet_id}"
            room = await self.yjs_server.get_room(room_name)

            # Wait for room to be ready
            if not room.ready:
                await room.start()

            # Get cardsMetadata map
            cards_metadata = room.ydoc.get_map('cardsMetadata')

            # Use a transaction to batch all operations
            with room.ydoc.begin_transaction() as txn:
                # Check if card already exists
                existing_card = cards_metadata.get(card_id)

                if existing_card and isinstance(existing_card, YMap):
                    # Update existing nested Y.Map
                    for key, value in card_data.items():
                        existing_card.set(txn, key, value)
                    logger.debug(f"Updated existing card {card_id} in {sheet_id}")
                else:
                    # Create new standalone nested Y.Map
                    card_map = YMap()
                    for key, value in card_data.items():
                        card_map[key] = value

                    # Store in cardsMetadata (this integrates it into the doc)
                    cards_metadata.set(txn, card_id, card_map)
                    logger.debug(f"Created new card {card_id} in {sheet_id}")

            logger.info(f"Synced card {card_id} to Yjs sheet {sheet_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to sync card {card_id} to Yjs sheet {sheet_id}: {e}")
            return False

    async def remove_card_from_sheet(
        self,
        sheet_id: str,
        card_id: str
    ) -> bool:
        """
        Remove a card from a sheet's Yjs document.

        Removes the card from cardsMetadata. Note: This does NOT remove
        the card from cells - use remove_card_from_cell for that.

        Args:
            sheet_id: Sheet/room identifier
            card_id: Card ID to remove

        Returns:
            True if successful, False otherwise
        """
        try:
            room_name = f"/yjs/{sheet_id}"
            room = await self.yjs_server.get_room(room_name)

            if not room.ready:
                await room.start()

            cards_metadata = room.ydoc.get_map('cardsMetadata')

            with room.ydoc.begin_transaction() as txn:
                if card_id in cards_metadata:
                    cards_metadata.pop(txn, card_id)
                    logger.info(f"Removed card {card_id} from Yjs sheet {sheet_id}")
                else:
                    logger.warning(f"Card {card_id} not found in Yjs sheet {sheet_id}")

            return True

        except Exception as e:
            logger.error(f"Failed to remove card {card_id} from Yjs sheet {sheet_id}: {e}")
            return False

    async def set_card_field(
        self,
        sheet_id: str,
        card_id: str,
        field: str,
        value: any
    ) -> bool:
        """
        Set a single field on a card in the Yjs document.
        If value is None, the field is deleted from the card map.

        Args:
            sheet_id: Sheet/room identifier
            card_id: Card ID to update
            field: Field name to set
            value: Field value (or None to delete the field)

        Returns:
            True if successful, False otherwise
        """
        try:
            room_name = f"/yjs/{sheet_id}"
            room = await self.yjs_server.get_room(room_name)

            if not room.ready:
                await room.start()

            cards_metadata = room.ydoc.get_map('cardsMetadata')

            with room.ydoc.begin_transaction() as txn:
                # Get or create the card map
                if card_id not in cards_metadata:
                    card_map = room.ydoc.get_map(f"card_{card_id}")
                    cards_metadata.set(txn, card_id, card_map)
                else:
                    card_map = cards_metadata[card_id]

                # Set or delete the field
                if value is None:
                    # Delete the field if value is None
                    if field in card_map:
                        card_map.pop(txn, field)
                        logger.debug(f"Deleted field {field} from card {card_id}")
                else:
                    # Set the field value
                    card_map.set(txn, field, value)
                    logger.debug(f"Set field {field} on card {card_id} to {value}")

            return True

        except Exception as e:
            logger.error(f"Failed to set field {field} on card {card_id} in sheet {sheet_id}: {e}")
            return False

    async def sync_cell_to_sheet(
        self,
        sheet_id: str,
        row_id: str,
        col_id: str,
        card_id: Optional[str] = None
    ) -> bool:
        """
        Sync a cell position in the sheet's grid.

        Assigns a card to a cell, or clears a cell if card_id is None.

        Args:
            sheet_id: Sheet/room identifier
            row_id: Row identifier (e.g., "r-0")
            col_id: Column identifier (e.g., "c-3")
            card_id: Card to place in cell, or None to clear cell

        Returns:
            True if successful, False otherwise

        Example:
            # Place card in cell
            await yjs_sync.sync_cell_to_sheet(
                sheet_id="test-sheet-1",
                row_id="r-0",
                col_id="c-3",
                card_id="card-abc123"
            )

            # Clear cell
            await yjs_sync.sync_cell_to_sheet(
                sheet_id="test-sheet-1",
                row_id="r-0",
                col_id="c-3",
                card_id=None
            )
        """
        try:
            room_name = f"/yjs/{sheet_id}"
            room = await self.yjs_server.get_room(room_name)

            if not room.ready:
                await room.start()

            cells = room.ydoc.get_map('cells')
            cell_key = f"{row_id}:{col_id}"

            with room.ydoc.begin_transaction() as txn:
                if card_id is None:
                    # Clear cell
                    if cell_key in cells:
                        cells.pop(txn, cell_key)
                        logger.debug(f"Cleared cell {cell_key} in {sheet_id}")
                else:
                    # Assign card to cell
                    cells.set(txn, cell_key, {"cardId": card_id})
                    logger.debug(f"Assigned card {card_id} to cell {cell_key} in {sheet_id}")

            logger.info(f"Synced cell {cell_key} in Yjs sheet {sheet_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to sync cell {cell_key} in Yjs sheet {sheet_id}: {e}")
            return False

    async def add_row_to_sheet(
        self,
        sheet_id: str,
        row_id: str,
        position: Optional[int] = None
    ) -> bool:
        """
        Add a row to the sheet's rowOrder.

        Args:
            sheet_id: Sheet/room identifier
            row_id: Row identifier to add
            position: Position to insert at (None = append to end)

        Returns:
            True if successful, False otherwise
        """
        try:
            room_name = f"/yjs/{sheet_id}"
            room = await self.yjs_server.get_room(room_name)

            if not room.ready:
                await room.start()

            row_order = room.ydoc.get_array('rowOrder')

            with room.ydoc.begin_transaction() as txn:
                if position is None:
                    row_order.append(txn, row_id)
                else:
                    row_order.insert(txn, position, row_id)

            logger.info(f"Added row {row_id} to Yjs sheet {sheet_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to add row {row_id} to Yjs sheet {sheet_id}: {e}")
            return False

    async def add_column_to_sheet(
        self,
        sheet_id: str,
        col_id: str,
        position: Optional[int] = None
    ) -> bool:
        """
        Add a column to the sheet's colOrder.

        Args:
            sheet_id: Sheet/room identifier
            col_id: Column identifier to add
            position: Position to insert at (None = append to end)

        Returns:
            True if successful, False otherwise
        """
        try:
            room_name = f"/yjs/{sheet_id}"
            room = await self.yjs_server.get_room(room_name)

            if not room.ready:
                await room.start()

            col_order = room.ydoc.get_array('colOrder')

            with room.ydoc.begin_transaction() as txn:
                if position is None:
                    col_order.append(txn, col_id)
                else:
                    col_order.insert(txn, position, col_id)

            logger.info(f"Added column {col_id} to Yjs sheet {sheet_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to add column {col_id} to Yjs sheet {sheet_id}: {e}")
            return False

    async def insert_card_at_front_of_lane(
        self,
        sheet_id: str,
        lane_id: str,
        card_id: str,
        position_offset: int = 0
    ) -> bool:
        """
        Insert a card at the front of a lane (position 1 + offset, after frozen header).
        Shifts all existing cards in the lane down to make room.

        Args:
            sheet_id: Sheet/room identifier
            lane_id: Lane (column in vertical mode) identifier
            card_id: Card ID to insert
            position_offset: Offset from position 1 (for batch uploads to maintain order)

        Returns:
            True if successful, False otherwise
        """
        try:
            room_name = f"/yjs/{sheet_id}"
            room = await self.yjs_server.get_room(room_name)

            if not room.ready:
                await room.start()

            cells = room.ydoc.get_map('cells')
            row_order = room.ydoc.get_array('rowOrder')

            with room.ydoc.begin_transaction() as txn:
                # Get all row IDs (timeline)
                rows = list(row_order)

                if len(rows) == 0:
                    logger.warning(f"No rows found in sheet {sheet_id}")
                    return False

                # Target position (1 = first data row, 2 = second, etc.)
                target_position = 1 + position_offset

                if target_position >= len(rows):
                    logger.warning(f"Target position {target_position} out of bounds (sheet has {len(rows)} rows)")
                    return False

                # Collect all existing cards in this lane starting from target position
                existing_cards = []
                for i in range(target_position, len(rows)):
                    row_id = rows[i]
                    cell_key = f"{row_id}:{lane_id}"
                    cell = cells.get(cell_key)
                    if cell and isinstance(cell, dict) and 'cardId' in cell:
                        existing_cards.append((i, cell))

                # Shift all existing cards down by 1 position
                # Work backwards to avoid overwriting
                for i, cell in reversed(existing_cards):
                    old_key = f"{rows[i]}:{lane_id}"
                    new_key = f"{rows[i + 1]}:{lane_id}"

                    # Move card to next position
                    cells.pop(txn, old_key)
                    cells.set(txn, new_key, cell)

                # Insert new card at target position
                target_row = rows[target_position]
                new_cell_key = f"{target_row}:{lane_id}"
                cells.set(txn, new_cell_key, {"cardId": card_id})
                logger.info(f"Inserted card {card_id} at position {target_position} in lane {lane_id} (shifted {len(existing_cards)} cards down)")

            return True

        except Exception as e:
            logger.error(f"Failed to insert card at position {1 + position_offset} in lane {lane_id} in sheet {sheet_id}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
