import { WebSocket } from 'ws';
import log from 'loglevel';
import { TextChannel } from 'discord.js';

export class KillboardSubscriber {
	public newbieMap: Map<string, string>;
	private socket: WebSocket | undefined;
	public newbieChannel: TextChannel | undefined;
	public killmailPostChannel: TextChannel | undefined;

	constructor() {
		this.newbieMap = new Map();
	}

	createSocketConnection() {
		log.info('Creating socket connection with zKillboard...');
		this.socket = new WebSocket('wss://zkillboard.com/websocket/');

		this.socket.on('open', () => {
			log.info('Created socket connection with zKillboard.');

			log.info('Subscribing to kill feed...');
			void this.subscribeToKillboard();
		});

		this.socket.on('message', (message: string) => {
			log.trace(`Received message from server: ${message}`);

			void this.processKillmail(JSON.parse(message) as APIKillboardResponse);
		});

		this.socket.on('close', () => {
			log.error('Socket connection with ZKillboard has been closed. Attempting to reconnect...');

			this.createSocketConnection();
		});
	}

	subscribeToKillboard() {
		const subscribingObject: object = {
			'action': 'sub',
			'channel': 'killstream',
		};

		(this.socket as WebSocket).send(JSON.stringify(subscribingObject));
		log.debug(JSON.stringify(subscribingObject));
		log.info('Subscribed to kill feed.');
	}

	processKillmail(response: APIKillboardResponse) {
		log.debug(`Killmail detected: ${response.killmail_id}`);
		log.debug(response);

		if (this.isNewbieKillmail(response.attackers, response.victim)) {
			log.info('Newbie killmail detected! Posting to channel...');
			void (this.newbieChannel as TextChannel).send(`뉴비 연관 킬메일 발생! https://zkillboard.com/kill/${response.killmail_id}/`);
		}

		if (this.isAllianceKillmail(response.attackers) && response.zkb.totalValue >= 100000000) {
			log.info('High value killmail detected! Posting to channel...');
			void (this.killmailPostChannel as TextChannel).send(`https://zkillboard.com/kill/${response.killmail_id}/`);
		}

		log.debug(response.victim.character_id);
	}

	isNewbieKillmail(attackers: KillmailAttacker[], victim: KillmailVictim) {
		if (victim.character_id && this.newbieMap.has(victim.character_id.toString())) return true;

		const attackerIds = attackers.map(attacker => attacker.character_id);
		log.debug(attackerIds);

		if (attackerIds.filter(attackerId => this.newbieMap.has(attackerId?.toString() ?? '')).length > 0) return true;

		return false;
	}

	isAllianceKillmail(attackers: KillmailAttacker[]) {
		const attackerAllianceIds = attackers.map(attacker => (attacker.alliance_id)) as number[];
		log.debug(attackerAllianceIds);

		if (attackerAllianceIds.includes(99010412)) return true;

		return false;
	}
}

export interface EveCharacterBase {
    character_id: number,
    character_name?: string,
}

interface APIKillboardResponse {
    attackers: KillmailAttacker[],
    killmail_id: number,
    killmail_time: string,
    solar_system_id: number,
    victim: KillmailVictim,
    zkb: KillmailZkillboardData,
}

interface KillmailCharacterBase {
    character_id?: number,
    corporation_id?: number,
    ship_type_id: number,
}

interface KillmailAttacker extends KillmailCharacterBase {
    alliance_id?: number,
    damage_done: number,
    final_blow: boolean,
    security_status: number,
    weapon_type_id?: number,
}

interface KillmailVictim extends KillmailCharacterBase {
    damage_taken: number,
    items: EveItem[],
    position: KillmailPosition,
}

interface EveItem {
    flag: number,
    item_type_id: number,
    quantity_dropped: number,
    singleton: number,
}

interface KillmailPosition {
    x: number,
    y: number,
    z: number,
}

interface KillmailZkillboardData {
    locationID: number,
    hash: string,
    fittedValue: number,
    droppedValue: number,
    destroyedValue: number,
    totalValue: number,
    points: number,
    npc: boolean,
    solo: boolean,
    awox: boolean,
    esi: string,
    url: string,
}