import { MessageReaction } from 'discord.js';
import { EventHandler } from './EventHandler';
import { StarboardResponse } from '../modules/starboard/StarboardResponse';
import { Storage } from '../storage/Storage';
import { StarboardRemoveReactChecker } from '../modules/starboard/StarboardChecker/StarboardRemoveReactChecker';

export class MessageReactionRemoveEventHandler extends EventHandler {
    public reaction: MessageReaction;

    public constructor(storage: Storage,
                       reaction: MessageReaction) {
        super(storage);
        this.reaction = reaction;
    }

    /**
     * Handles fetching of reaction if it's partial.
     *
     * @returns Promise<void>
     */
    public async handlePartial(): Promise<void> {
        if (this.reaction.partial) {
            await this.reaction.fetch();
        }
    }

    /**
     * Handles when a reaction is removed from a message
     *
     * @returns Promise
     */
    public async handleEvent(): Promise<void> {
        // Will error if trying to fetch on a partial removed reaction
        try {
            await this.handlePartial();
        } catch (err) {
            return;
        }

        const server = this.getServer(this.reaction.message.guild!.id.toString());
        const { starboardSettings } = server;
        const starboardChecker = new StarboardRemoveReactChecker(starboardSettings, this.reaction);

        // Check if the reaction removal qualifies for a change
        const pair = await starboardChecker.checkRemoveReact();

        // If it does, edit the starboard message, but don't delete to prevent abuse
        if (pair !== null) {
            const starboardResponse = new StarboardResponse(starboardSettings, this.reaction);

            // Check if emoji in channel is the same as the emoji reacted.
            const toEdit = await starboardChecker.checkEmojiInStarboardMessage(pair[1]);
            if (toEdit === true) {
                starboardResponse.editStarboardMessageCount(pair[0], pair[1]);
            }
        }
    }
}
