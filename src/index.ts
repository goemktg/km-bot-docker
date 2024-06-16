import {
  AuditLogEvent,
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
} from "discord.js";
import {
  loadEnvironmentVariables,
  getNewbieRoleIds,
  setDiscordPresence,
  getAuditTargetNickname,
  reflectNewbieRoleChange,
} from "./library/functions";
import { EsiRequester } from "./library/handlers/EsiRequester";
import { EveCharacterBase, KillboardSubscriber } from "./KillboardSubscriber";
import log from "loglevel";

loadEnvironmentVariables();

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "INFO";
log.setDefaultLevel(process.env.LOG_LEVEL as log.LogLevelDesc);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

void client.login(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, (c) => {
  log.info(`Bot Ready! Logged in as ${c.user.tag}`);
  log.info("Loading newbie data...");

  const guilds = client.guilds.cache.values();

  const getNewbieInfos = [];
  const newbieMapTemp = new Map<string, string>();
  for (const guild of guilds) {
    log.info(`Loading newbie data from ${guild.name}/${guild.id}...`);

    getNewbieInfos.push(
      (async () => {
        const members = await guild.members.fetch();
        const newbieNames = members
          .filter((member) => member.roles.cache.hasAny(...getNewbieRoleIds()))
          .map((member) => member.nickname);

        for (const nickname of newbieNames) {
          if (!nickname) throw new Error("member.nickname is not defined.");
          newbieMapTemp.set(nickname, "");
        }

        const esiRequester = new EsiRequester();
        const esiUsers = (
          await esiRequester.getIdsFromNames(Array.from(newbieMapTemp.keys()))
        ).characters?.map((item) => ({
          character_id: item.id,
          character_name: item.name,
        })) as EveCharacterBase[];

        if (esiUsers) {
          for (const esiUser of esiUsers) {
            newbieMapTemp.set(
              esiUser.character_name,
              esiUser.character_id.toString(),
            );
          }
        }
      })(),
    );
  }
  void Promise.all(getNewbieInfos).then(() => {
    log.info("Loaded newbie data.");
    logNewbieMap();
  });

  setDiscordPresence(client, "킬보드 감시 중");

  log.info("registering killmail post channels...");
  if (
    !process.env.DISCORD_KM_POST_CHANNEL_ID ||
    !process.env.DISCORD_NEWBIE_CHANNEL_ID
  ) {
    throw new Error(
      "DISCORD_KM_POST_CHANNEL_ID or DISCORD_NEWBIE_CHANNEL_ID is not defined.",
    );
  }
  const newbieChannel = client.channels.cache.get(
    process.env.DISCORD_NEWBIE_CHANNEL_ID,
  ) as TextChannel;
  const killmailPostChannel = client.channels.cache.get(
    process.env.DISCORD_KM_POST_CHANNEL_ID,
  ) as TextChannel;

  if (!newbieChannel || !killmailPostChannel) {
    throw new Error("Channel ID is Invalid");
  }
  log.info("registered killmail post channels.");
  const killboardSubscriber = new KillboardSubscriber(
    newbieChannel,
    killmailPostChannel,
    newbieMapTemp,
  );

  function add(nickname: string) {
    const esiRequester = new EsiRequester();
    void esiRequester.getIdsFromNames([nickname]).then((esiUsersResponse) => {
      const esiUsers = esiUsersResponse.characters?.map((item) => ({
        character_id: item.id,
        character_name: item.name,
      })) as EveCharacterBase[];

      if (esiUsers.length === 0) {
        log.error("ESI returned no character names. Skipping...");
        return;
      }
      for (const esiUser of esiUsers) {
        killboardSubscriber.newbieMap.set(
          esiUser.character_name,
          esiUser.character_id.toString(),
        );
        logNewbieMap();
      }
    });
  }

  function remove(nickname: string) {
    killboardSubscriber.newbieMap.delete(nickname);
    logNewbieMap();
  }
  /**
   * 디스코드 서버에서 멤버 역할 변경 로그가 발생하면 실행됩니다.
   */
  client.on(Events.GuildAuditLogEntryCreate, (auditLog, guild) => {
    if (auditLog.action != AuditLogEvent.MemberRoleUpdate) return;

    void (async () => {
      const nickname = await getAuditTargetNickname(auditLog, guild);
      void reflectNewbieRoleChange(auditLog, nickname, add, remove);
    })();
  });

  function logNewbieMap() {
    log.info(killboardSubscriber.newbieMap);
  }
});
