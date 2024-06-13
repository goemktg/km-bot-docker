import { WebSocket } from 'ws';
import { TextChannel } from 'discord.js';
import log from 'loglevel';
import fs from 'fs';

export class KillboardSubscriber {
	public newbieMap: Map<string, string>;
	private socket: WebSocket | undefined;
	public newbieChannel: TextChannel | undefined;
	public killmailPostChannel: TextChannel | undefined;
	private timeout: NodeJS.Timeout | undefined;

	constructor() {
		this.newbieMap = new Map();
	}

	createSocketConnection() {
		this.socket = new WebSocket('wss://zkillboard.com/websocket/');

		this.socket.on('open', () => {
			log.info('Created socket connection with zKillboard.');

			const subscribingObject: object = {
				'action': 'sub',
				'channel': 'killstream',
			};

			(this.socket as WebSocket).send(JSON.stringify(subscribingObject));
			log.debug(JSON.stringify(subscribingObject));
			log.info('Subscribed to kill feed.');

			fs.writeFileSync('status.json', '{"status": "ok"}');
			this.startWriteStatus();
		});

		this.socket.on('message', (message: string) => {
			log.trace(`Received message from server: ${message}`);

			if (this.timeout === undefined) {throw new Error('Timeout is not defined.');}

			clearTimeout(this.timeout);
			this.startWriteStatus();

			void this.processKillmail(JSON.parse(message) as APIKillboardResponse);
		});

		this.socket.on('close', () => {
			log.error('Socket connection with ZKillboard has been closed. Attempting to reconnect...');

			this.createSocketConnection();
		});
	}

	processKillmail(response: APIKillboardResponse) {
		log.debug(`Killmail detected: ${response.killmail_id}`);
		log.trace(response);

		if (this.newbieChannel === undefined || this.killmailPostChannel === undefined) {throw new Error('Channel is not defined.');}

		switch (this.findOutKillmailType(response)) {
		case 0:
			log.info('Newbie killmail detected! Posting to channel...');
			void this.newbieChannel.send(`뉴비 연관 킬메일 발생! https://zkillboard.com/kill/${response.killmail_id}/`);
			break;
		case 1:
			log.info('High value killmail detected! Posting to channel...');
			void this.killmailPostChannel.send(`https://zkillboard.com/kill/${response.killmail_id}/`);
			break;
		default:
		}

		log.debug(response.victim.character_id);
	}

	/**
	 * 킬메일이 뉴비 킬메일인지 고액 킬메일인지 아무것도 아닌지 판단하여 맞는 타입을 리턴합니다.
	 * @returns {0: 뉴비 킬메일| 1: 고액 킬메일| 2: 아무것도 아님}
	 */
	findOutKillmailType(response: APIKillboardResponse) : 0 | 1 | 2 {
		log.debug(response);
		// 뉴비가 사망
		if (this.newbieMap.has(this.getTypeSafeIdString(response.victim))) return 0;
		const isExpansiveKillmail = response.zkb.totalValue >= 100000000;

		for (const attacker of response.attackers) {
			// 뉴비가 킬
			if (this.newbieMap.has(this.getTypeSafeIdString(attacker))) return 0;
			// 얼라이언스킬 + 100M 이상 킬
			else if (isExpansiveKillmail && attacker.alliance_id === 99010412) return 1;
		}

		return 2;
	}

	getTypeSafeIdString(killmailCharacter: KillmailAttacker | KillmailVictim): string {
		if (killmailCharacter.character_id === undefined) {
			log.warn('Character ID is not defined. return null');
			return 'null';
		}
		else {
			return killmailCharacter.character_id.toString();
		}
	}

	/**
	 * 킬메일 소캣 프로그래밍의 상태를 status.json 파일에 저장합니다.
	 */
	startWriteStatus() {
		this.timeout = setTimeout(() => {
			log.error('zkillboard socket is not responding...');
			fs.writeFileSync('status.json', '{"status": "504"}');
		}, 60000);
	}
}

export interface EveCharacterBase {
    character_id: number,
    character_name: string,
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
    corporation_id: number,
    ship_type_id: number,
}

interface KillmailAttacker extends KillmailCharacterBase {
    alliance_id: number,
    damage_done: number,
    final_blow: boolean,
    security_status: number,
    weapon_type_id: number,
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