import { WebSocket } from 'ws';
import { setTimeout } from 'timers/promises';
import log from 'loglevel';
import { TextChannel } from 'discord.js';

export class KillboardSubscriber {
	private socket: WebSocket;
	private isSocketOpen: boolean;
	public newbieMap: Map<string, string>;
	public newbieChannel: TextChannel | undefined;
	public killmailPostChannel: TextChannel | undefined;

	constructor() {
		this.newbieMap = new Map();
		log.info('Creating Socket Connection with ZKillboard...');

		this.isSocketOpen = false;
		this.socket = new WebSocket('wss://zkillboard.com/websocket/');

		this.socket.on('open', () => {
			log.info('Created Socket connection with ZKillboard.');
			this.isSocketOpen = true;
		});

		this.socket.on('message', (message: string) => {
			// log.trace(`Received message from server: ${message}`);

			void this.processKillmail(JSON.parse(message) as APIKillboardResponse);
		});

		this.socket.on('close', () => {
			log.error('Socket connection with ZKillboard has been closed. Attempting to reconnect...');
		});
	}

	async subscribeToKillboard() {
		while (!this.isSocketOpen) {
			log.warn('Socket is not open yet. Waiting 10 second...');
			await setTimeout(10000);
		}

		let subscribingObjects: subscribingObject[];

		if (!process.env.DEBUG) {
			log.warn('DEBUG_MODE is not defined. defaulting to false.');
			process.env.DEBUG = 'false';
		}

		if (process.env.DEBUG === 'false') {
			subscribingObjects = [{
				'action': 'sub',
				'channel': 'alliance:99010412',
			}];

			for (const [id] of this.newbieMap) {
				subscribingObjects.push({
					'action': 'sub',
					'channel': `character:${id}`,
				});
			}
		}
		else if (process.env.DEBUG === 'true') {
			log.info('debug mode. subscribing to entire killstream...');
			subscribingObjects = [{
				'action': 'sub',
				'channel': 'killstream',
			}];
		}
		else {
			throw new Error('DEBUG MODE is not boolean. It must be true/false.');
		}

		log.info('subscribing to:');
		log.info(subscribingObjects);
		for (const subscribingObject of subscribingObjects) {
			this.socket.send(JSON.stringify(subscribingObject));
		}
		log.info('subscribed to killboard.');
	}

	async processKillmail(response: APIKillboardResponse) {
		while (!this.newbieChannel || !this.killmailPostChannel) {
			log.warn('Not Recived Channel Data. Waiting 10 second...');
			await setTimeout(10000);
		}

		log.info(`Killmail detected: ${response.killmail_id}`);
		log.debug(response);

		if (this.isNewbieKillmail(response.attackers, response.victim)) {
			log.info('Newbie killmail detected! Posting to channel...');
			void this.newbieChannel.send(`뉴비 연관 킬메일 발생! https://zkillboard.com/kill/${response.killmail_id}/`);
		}

		if (response.zkb.totalValue >= 100000000) {
			log.info('High value killmail detected! Posting to channel...');
			void this.killmailPostChannel.send(`https://zkillboard.com/kill/${response.killmail_id}/`);
		}
	}

	isNewbieKillmail(attackers: KillmailAttacker[], victim: KillmailVictim) {
		if (victim.character_id && this.newbieMap.get(victim.character_id.toString())) return true;

		const newbies = attackers.filter(attacker => {attacker.character_id && this.newbieMap.has(attacker.character_id.toString());});
		if (newbies.length > 0) return true;

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

export interface subscribingObject {
    action: string,
    channel: string,
}