import { DatabaseConnection } from '../../DatabaseConnection';
import { ModActions } from './classes/ModActions';
import { ModerationTimeout } from './classes/ModerationTimeout';

export class ModDbUtils {
    /**
     * Returns the latest case number of a specified server from mod log table
     * @param {string} serverId
     * @returns number
     */
    public static getLastestCaseId(serverId: string): number {
        const db = DatabaseConnection.connect();
        const res = db.prepare(
            'SELECT caseId FROM moderationLogs WHERE serverId = ? ORDER BY caseId DESC',
        ).get(serverId);
        db.close();
        return res ? res.caseId : 0;
    }

    /**
     * Adds an action with a timeout into the timeout database, updates on conflict of pkeys
     *
     * @param  {number} endTime
     * @param  {string} userId
     * @param  {ModActions} type
     * @param  {string} serverId
     * @param  {number} timerId
     * @returns void
     */
    public static addActionTimeout(endTime: number, userId: string, type: ModActions,
                                   serverId: string, timerId: number): void {
        const db = DatabaseConnection.connect();
        db.prepare(
            'INSERT INTO moderationTimeouts (serverId, userId, type, endTime, timerId) VALUES (?, ?, ?, ?, ?) ' +
            'ON CONFLICT(serverId, userId, type) DO UPDATE SET timerId = excluded.timerId',
        ).run(serverId, userId, type, endTime, timerId);
        db.close();
    }

    /**
     * Remove an entry from the timeout database
     *
     * @param  {string} userId
     * @param  {ModActions} type
     * @param  {string} serverId
     * @returns number timerId if success, 0 if fail
     */
    public static removeActionTimeout(userId: string, type: ModActions,
                                      serverId: string): number {
        const db = DatabaseConnection.connect();

        // Get the timerId
        const res = db.prepare(
            'SELECT timerId FROM moderationTimeouts WHERE serverId = ? AND userId = ? AND type = ?',
        ).get(serverId, userId, type);

        let timerId = 0;
        // If entry exists, remove
        if (res) {
            timerId = res.timerId;
            // Delete row
            db.prepare(
                'DELETE FROM moderationTimeouts WHERE serverId = ? AND userId = ? AND type = ?',
            ).run(serverId, userId, type);
        }
        db.close();

        return timerId;
    }

    /**
     * Adds a mod action into the database
     * reason || null because reason could be an empty string, in that case we do want to
     * record down null in the database.
     *
     * @param  {string} serverId
     * @param  {string} modId
     * @param  {string} userId
     * @param  {ModActions} type
     * @param  {number} timestamp
     * @param  {string|null} reason?
     * @param  {number|null} timeout?
     * @returns void
     */
    public static addModerationAction(serverId: string, modId: string, userId: string,
                                      type: ModActions, timestamp: number, reason?: string|null,
                                      timeout?: number|null): void {
        const db = DatabaseConnection.connect();
        const caseId = ModDbUtils.getLastestCaseId(serverId);
        db.prepare(
            'INSERT INTO moderationLogs (serverId, caseId, modId, userId, type,' +
            ' reason, timeout, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(serverId, caseId + 1, modId, userId, type, reason || null, timeout, timestamp);
        db.close();
    }

    /**
     * Fetches all timeout entries in the moderationTimeouts table.
     *
     * @returns ModerationTimeout[]
     */
    public static fetchActionTimeouts(): ModerationTimeout[] {
        const db = DatabaseConnection.connect();
        const res = db.prepare('SELECT * FROM moderationTimeouts').all();
        db.close();
        return res;
    }

    /**
     * Fetches the number of warns a user has gotten in a server.
     *
     * @param  {string} serverId
     * @param  {string} userId
     * @returns number
     */
    public static fetchNumberOfWarns(serverId: string, userId: string): number {
        const db = DatabaseConnection.connect();
        const res = db.prepare(
            'SELECT COUNT(*) FROM moderationLogs WHERE serverId = ? AND userId = ?',
        ).get(serverId, userId);
        db.close();
        if (res)
            return res['COUNT(*)'];
        return 0;
    }

    /**
     * Checks if there is a warn action associated with the number of warnings.
     * Returns null if none else return an object containing the type and the duration in seconds.
     *
     * @param  {string} serverId
     * @param  {number} numWarns
     * @returns { type: ModActions; duration: number; } | null
     */
    public static fetchWarnAction(serverId: string, numWarns: number): { type: ModActions;
                                                                         duration: number|null;
                                                                       } | null {
        const db = DatabaseConnection.connect();
        const res = db.prepare(
            'SELECT type, duration FROM moderationWarnSettings WHERE serverId = ? AND numWarns = ?',
        ).get(serverId, numWarns);
        db.close();

        if (res) {
            const { type, duration } = res;
            return { type, duration };
        }

        return null;
    }

    /**
     * Deletes a warning from the moderationLogs table.
     * Returns false if nothing was deleted (the warn did not exist)
     *
     * @param  {string} serverId
     * @param  {number} caseId
     * @returns boolean
     */
    public static deleteWarn(serverId: string, caseId: number): boolean {
        const db = DatabaseConnection.connect();
        const res = db.prepare(
            'DELETE FROM moderationLogs WHERE serverId = ? AND caseId = ? AND type = ?',
        ).run(serverId, caseId, 'WARN');
        db.close();
        return !!res.changes;
    }

    /**
     * Adds an entry to the moderationWarnSettings table.
     *
     * @param  {string} serverId
     * @param  {number} numWarns
     * @param  {ModActions} type
     * @param  {number} duration
     * @returns void
     */
    public static addWarnSettings(serverId: string, numWarns: number,
                                  type: ModActions, duration: number|null): void {
        const db = DatabaseConnection.connect();
        db.prepare(
            'INSERT INTO moderationWarnSettings (serverId, numWarns, type, duration) VALUES (?, ?, ?, ?)',
        ).run(serverId, numWarns, type, duration);
        db.close();
    }

    /**
     * Deletes all entries of a given server from the moderationWarnSettings table
     *
     * @param  {string} serverId
     * @returns void
     */
    public static resetWarnSettings(serverId: string): void {
        const db = DatabaseConnection.connect();
        db.prepare(
            'DELETE FROM moderationWarnSettings WHERE serverId = ?',
        ).run(serverId);
        db.close();
    }

    /**
     * Returns the rows of the moderationWarnSettings table of a serverId.
     *
     * @param  {string} serverId
     * @returns { numWarns: number; type: ModActions; duration: number|null; }[]
     */
    public static getWarnSettings(serverId: string): { numWarns: number; type: ModActions;
                                                       duration: number|null; }[] {
        const db = DatabaseConnection.connect();
        const res = db.prepare(
            'SELECT numWarns, type, duration FROM moderationWarnSettings WHERE serverId = ?',
        ).all(serverId);
        db.close();
        return res;
    }

    /**
     * Sets the reporting channel of a server on the moderationSettings table.
     *
     * @param  {string} serverId
     * @param  {string|null} channelId
     * @returns void
     */
    public static setModLogChannel(serverId: string, channelId: string|null): void {
        const db = DatabaseConnection.connect();
        db.prepare(
            'UPDATE moderationSettings SET channelId = ? WHERE serverId = ?',
        ).run(channelId, serverId);
        db.close();
    }

    /**
     * Gets the reporting channel of the server from the moderationSettings table.
     * @param  {string} serverId
     * @returns string
     */
    public static getModLogChannel(serverId: string): string|null {
        const db = DatabaseConnection.connect();
        const res = db.prepare(
            'SELECT channelId FROM moderationSettings WHERE serverId = ?',
        ).get(serverId);
        db.close();
        return res.channelId;
    }
}
