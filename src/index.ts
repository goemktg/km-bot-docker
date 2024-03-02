import { AuditLogEvent, Client, Events, GatewayIntentBits, TextChannel } from 'discord.js';
import { loadEnvironmentVariables, getNewbieRoleIds, setDiscordPresence, getAuditTargetNickname, reflectNewbieRoleChange } from './library/functions';
import { EsiRequester } from './library/handlers/EsiRequester';
import { EveCharacterBase, KillboardSubscriber } from './killboardSubscriber';
import log from 'loglevel';

loadEnvironmentVariables();

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'INFO';
log.setDefaultLevel(process.env.LOG_LEVEL as log.LogLevelDesc);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration] });
const killboardSubscriber = new KillboardSubscriber();

void client.login(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, async c => {
	log.info(`Bot Ready! Logged in as ${c.user.tag}`);
	log.info('Loading newbie data...');

	const guilds = client.guilds.cache.values();

	for (const guild of guilds) {
		log.info(`Loading newbie data from ${guild.name}/${guild.id}...`);

		const members = await guild.members.fetch();
		const newbieNames = members.filter(member => member.roles.cache.hasAny(...getNewbieRoleIds())).map(member => member.nickname);

		for (const nickname of newbieNames) {
			if (!nickname) throw new Error('member.nickname is not defined.');
			killboardSubscriber.newbieMap.set(nickname, '');
		}
	}

	const esiRequester = new EsiRequester();
	const esiUsers = (await esiRequester.getIdsFromNames(Array.from(killboardSubscriber.newbieMap.keys()))).characters?.map((item => ({
		character_id: item.id,
		character_name: item.name,
	}))) as EveCharacterBase[];

	if (esiUsers) {
		for (const esiUser of esiUsers) {
			killboardSubscriber.newbieMap.set(esiUser.character_name as string, esiUser.character_id.toString());
		}
	}

	log.info('Newbie data loaded!');
	log.info(killboardSubscriber.newbieMap);

	setDiscordPresence(client, '킬보드 감시 중');

	log.info('Subscribing to kill feed...');
	void killboardSubscriber.subscribeToKillboard();

	log.info('registing killmail post channels...');
	if (!process.env.DISCORD_KM_POST_CHANNEL_ID || !process.env.DISCORD_NEWBEE_CHANNEL_ID) {throw new Error('DISCORD_KM_POST_CHANNEL_ID or DISCORD_NEWBEE_CHANNEL_ID is not defined.');}
	const newbieChannel = client.channels.cache.get(process.env.DISCORD_NEWBEE_CHANNEL_ID) as TextChannel;
	const killmailPostChannel = client.channels.cache.get(process.env.DISCORD_KM_POST_CHANNEL_ID) as TextChannel;

	if (!newbieChannel || !killmailPostChannel) {throw new Error('Channel ID is Invalid');}
	killboardSubscriber.newbieChannel = newbieChannel;
	killboardSubscriber.killmailPostChannel = killmailPostChannel;
	log.info('registered killmail post channels.');
});

client.on(Events.GuildAuditLogEntryCreate, async (auditLog, guild) => {
	if (auditLog.action != AuditLogEvent.MemberRoleUpdate || auditLog.executorId === '1066230195473883136') return;

	const nickname = await getAuditTargetNickname(auditLog, guild);
	void reflectNewbieRoleChange(auditLog, nickname, add, remove);
	log.info('registered killmail post channels.');
});

function add(nickname: string) {
	const esiRequester = new EsiRequester;
	void esiRequester.getIdsFromNames([nickname])
		.then(esiUsersResponse => {
			const esiUsers = esiUsersResponse.characters?.map((item => ({
				character_id: item.id,
				character_name: item.name,
			}))) as EveCharacterBase[];

			if (esiUsers.length === 0) {
				log.error('ESI returned no character names. Skipping...');
				return;
			}
			for (const esiUser of esiUsers) {
				killboardSubscriber.newbieMap.set(esiUser.character_name as string, esiUser.character_id.toString());
			}
		});
}

function remove(nickname: string) {
	killboardSubscriber.newbieMap.delete(nickname);
}