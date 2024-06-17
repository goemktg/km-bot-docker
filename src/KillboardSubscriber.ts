import { WebSocket } from "ws";
import { TextChannel } from "discord.js";
import log from "loglevel";
import fs from "fs";

export class KillboardSubscriber {
  public newbieMap: Map<string, string>;
  private socket: WebSocket;
  private newbieChannel: TextChannel;
  private killmailPostChannel: TextChannel;
  private lastTriggeredTime: number;

  constructor(
    newbieChannel: TextChannel,
    killmailPostChannel: TextChannel,
    newbieMap: Map<string, string>,
  ) {
    this.newbieMap = newbieMap;
    this.lastTriggeredTime = Date.now();
    this.newbieChannel = newbieChannel;
    this.killmailPostChannel = killmailPostChannel;
    this.socket = new WebSocket("wss://zkillboard.com/websocket/");

    // 30초마다 새 킬메일이 30초 이내에 발생했는지 확인합니다.
    setInterval(() => {
      const elapsedTime = Date.now() - this.lastTriggeredTime;
      log.debug(elapsedTime);

      if (elapsedTime > 30000) {
        log.error(
          "Zkillboard is not sending killmails. trying to reconnect...",
        );
        this.socket.close();
        fs.writeFileSync("status.json", '{"status": "not ok"}');
      } else {
        fs.writeFileSync("status.json", '{"status": "ok"}');
      }
    }, 30000);

    this.initializeZkillboardSocketEvents();
  }

  initializeZkillboardSocketEvents() {
    this.socket.on("open", () => {
      log.info("Created socket connection with zKillboard.");

      const subscribingObject: object = {
        action: "sub",
        channel: "killstream",
      };

      this.socket.send(JSON.stringify(subscribingObject));
      log.trace(JSON.stringify(subscribingObject));
      log.info("Subscribed to kill feed.");
    });

    this.socket.on("message", (message: string) => {
      log.trace(`Received message from server: ${message}`);

      // lastTriggeredTime 을 업데이트합니다.
      this.lastTriggeredTime = Date.now();

      void this.processKillmail(JSON.parse(message) as APIKillboardResponse);
    });

    this.socket.on("close", () => {
      log.error(
        "Socket connection with ZKillboard has been closed. Attempting to reconnect...",
      );

      this.socket = new WebSocket("wss://zkillboard.com/websocket/");
      this.initializeZkillboardSocketEvents();
    });
  }

  processKillmail(response: APIKillboardResponse) {
    log.debug(`Killmail detected: ${response.killmail_id}`);
    log.trace(response);

    if (
      this.newbieChannel === undefined ||
      this.killmailPostChannel === undefined
    ) {
      throw new Error("Channel is not defined.");
    }

    switch (this.findOutKillmailType(response)) {
      case 0:
        log.info("Newbie killmail detected! Posting to channel...");
        void this.newbieChannel.send(
          `뉴비 연관 킬메일 발생! https://zkillboard.com/kill/${response.killmail_id}/`,
        );
        break;
      case 1:
        log.info("High value killmail detected! Posting to channel...");
        void this.killmailPostChannel.send(
          `https://zkillboard.com/kill/${response.killmail_id}/`,
        );
        break;
      default:
    }

    log.trace(response.victim.character_id);
  }

  /**
   * 킬메일이 뉴비 킬메일인지 고액 킬메일인지 아무것도 아닌지 판단하여 맞는 타입을 리턴합니다.
   * @returns {0: 뉴비 킬메일| 1: 고액 킬메일| 2: 아무것도 아님}
   */
  findOutKillmailType(response: APIKillboardResponse): 0 | 1 | 2 {
    log.trace(response);
    // 뉴비가 사망
    if (this.newbieMap.has(this.getTypeSafeIdString(response.victim))) return 0;
    const isExpansiveKillmail = response.zkb.totalValue >= 100000000;

    for (const attacker of response.attackers) {
      // 뉴비가 킬
      if (this.newbieMap.has(this.getTypeSafeIdString(attacker))) return 0;
      // 얼라이언스킬 + 100M 이상 킬
      else if (isExpansiveKillmail && attacker.alliance_id === 99010412)
        return 1;
    }

    return 2;
  }

  getTypeSafeIdString(
    killmailActor: KillmailAttacker | KillmailVictim | KillmailNPCBase,
  ): string {
    // character_id 가 없는 경우.
    if (!("character_id" in killmailActor)) {
      return "null";
    } else {
      return killmailActor.character_id.toString();
    }
  }
}

export interface EveCharacterBase {
  character_id: number;
  character_name: string;
}

interface APIKillboardResponse {
  attackers: KillmailAttacker[];
  killmail_id: number;
  killmail_time: string;
  solar_system_id: number;
  victim: KillmailVictim;
  zkb: KillmailZkillboardData;
}

interface KillmailCharacterBase {
  character_id: number;
  corporation_id: number;
  ship_type_id: number;
}

interface KillmailNPCBase {
  damage_done: number;
  faction_id: number;
  final_blow: boolean;
  security_status: number;
  ship_type_id: number;
}

interface KillmailAttacker extends KillmailCharacterBase {
  alliance_id: number;
  damage_done: number;
  final_blow: boolean;
  security_status: number;
  weapon_type_id: number;
}

interface KillmailVictim extends KillmailCharacterBase {
  damage_taken: number;
  items: EveItem[];
  position: KillmailPosition;
}

interface EveItem {
  flag: number;
  item_type_id: number;
  quantity_dropped: number;
  singleton: number;
}

interface KillmailPosition {
  x: number;
  y: number;
  z: number;
}

interface KillmailZkillboardData {
  locationID: number;
  hash: string;
  fittedValue: number;
  droppedValue: number;
  destroyedValue: number;
  totalValue: number;
  points: number;
  npc: boolean;
  solo: boolean;
  awox: boolean;
  esi: string;
  url: string;
}
