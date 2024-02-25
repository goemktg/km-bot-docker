const { Client, Events, GatewayIntentBits, EmbedBuilder, ActivityType, AuditLogEvent } = require('discord.js');
const { loadEnvironmentVariables, getAuditTargetNickname } = require('./library/functions.js');
const cron = require('node-cron');
const axios = require('axios');

loadEnvironmentVariables();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration] });
client.login(process.env.DISCORD_TOKEN);

const newbieData = new Map();
client.once(Events.ClientReady, async c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
	console.log('Loading newbie data...');
	const members = await client.guilds.cache.get('337276039858356224').members.fetch();
	const newbieNames = members.filter(member => member.roles.cache.has('1210191232756621383')).map(member => member.nickname);

	const esiRequest = new (require('./library/esi-request.js'))();
	const newbieRawDatas = (await esiRequest.getIdsFromNames(newbieNames)).characters;

	newbieRawDatas.forEach(newbie => {
		newbieData.set(newbie.name, newbie.id);
	});

	console.log('newbie data loaded!:');
	console.log(newbieData);

	// 봇 상태메시지 설정
	client.user.setPresence({
		activities: [{
			type: ActivityType.Custom,
			name: 'custom',
			state: '킬보드 감시 중',
		}],
	});
});

client.on(Events.GuildAuditLogEntryCreate, async auditLog => {
	if (auditLog.action != AuditLogEvent.MemberRoleUpdate || auditLog.changes[0].new[0].id != '1210191232756621383') {return;}

	const nickname = await getAuditTargetNickname(auditLog, client);
	const Id = newbieData.get(nickname);

	if (Id === undefined && auditLog.changes[0].key === '$add') {
		const esiRequest = new (require('./library/esi-request.js'))();
		esiRequest.getIdsFromNames([nickname]).then(newbie => {
			newbieData.set(newbie.characters[0].name, newbie.characters[0].id);
		});
	}
	else if (Id !== undefined && auditLog.changes[0].key === '$remove') {
		newbieData.delete(nickname);
	}

	console.log('newbie data changed: ', newbieData);
});

let isJobRunning = false;
cron.schedule('* * * * *', async function() {
	if (!isJobRunning) {
		console.log('time to get data!');
		processKillmail();
	}
	else {
		console.log('time to get data. but job is already running.');
	}
});

const redisqURL = 'https://redisq.zkillboard.com/listen.php?queueID=Goem_Funaila';
console.log('getting data from:' + redisqURL);

async function processKillmail(testData = null) {
	isJobRunning = true;
	let isKillmailExist = true;

	while (isKillmailExist) {
		let redisqData;
		try {
			redisqData = (await axios.get(redisqURL)).data.package;
		}
		catch (error) {
			console.log('WARN: error occured while getting killmail data. skip killmail process.');
			console.log(error);
			isKillmailExist = false;
			isJobRunning = false;
			return;
		}

		if (redisqData == null) {
			console.log('no killmail returned. skip killmail process.');
			isKillmailExist = false;
			isJobRunning = false;
			return;
		}

		if (testData != null) {redisqData = JSON.parse(testData).package;}

		let isPushed = false;

		const newbieIds = Array.from(newbieData.values());

		const attackersNewbee = redisqData.killmail.attackers.filter(attacker => newbieIds.includes(attacker.character_id));
		const attackersOldbee = redisqData.killmail.attackers.filter(attacker => attacker.alliance_id == 99010412);

		if (newbieIds.includes(redisqData.killmail.victim.character_id)) {
			pushKillmailMsg(redisqData, 'lost', attackersNewbee);
			isPushed = true;
			console.log('processed: ' + redisqData.killID + ' - type: newbee lost');
		}
		else if (attackersNewbee.length != 0) {
			pushKillmailMsg(redisqData, 'kill', attackersNewbee);
			isPushed = true;
			console.log('processed: ' + redisqData.killID + ' - type: newbee kill');
		}

		if (attackersOldbee.length != 0 && redisqData.zkb.totalValue >= 100000000) {
			client.channels.cache.get(process.env.DISCORD_KM_POST_CHANNEL_ID).send('https://zkillboard.com/kill/' + redisqData.killID + '/');
			isPushed = true;
			console.log('processed: ' + redisqData.killID + ' - type: oldbee kill');

		}

		if (!isPushed) {console.log('processed: ' + redisqData.killID);}

		await new Promise((resolve) => {
			setTimeout(() => {
				resolve();
			}, 500);
		});

		if (testData != null) {isKillmailExist = false;}
	}

	isJobRunning = false;
}

// TODO: 재작성 하기
async function pushKillmailMsg(package, type, newbeeAttackerIDs) {
	// make using id as array
	const idMap = new Map();
	idMap.set(package.killmail.victim.ship_type_id, null);
	idMap.set(package.killmail.victim.character_id, null);
	idMap.set(package.killmail.solar_system_id, null);

	for (const element of newbeeAttackerIDs) {

		idMap.set(element.character_id, null);
		idMap.set(element.ship_type_id, null);
		idMap.set(element.weapon_type_id, null);
	}

	const postData = JSON.stringify(Array.from(idMap.keys()));

	// get name resolved
	const EsiResponse = await axios.post('https://esi.evetech.net/latest/universe/names/?datasource=tranquility', postData, {
		headers: {
			'User-Agent': 'Maintainer: Goem Funaila(IG) samktg52@gmail.com',
		},
	});
	const EsiData = EsiResponse.data;

	// apply esi data
	for (const element of EsiData) {
		idMap.set(element.id, element.name);
	}

	//                                      true : false
	const embedColor = (type == 'lost') ? 0xFF0000 : 0x00FFFF;

	//                  Kill: Goem Funaila (Keres)
	const embedTitle = 'Kill: ' + idMap.get(package.killmail.victim.character_id) + ' (' + idMap.get(package.killmail.victim.ship_type_id) + ')';
	// case lost) newbee **Goem Funaila** lost
	//            flying in a **Praxis**
	//            Final Blowed by
	//            **Goem Funaila** flying in a **Praxis** with Caldari Navy Nova Heavy Assault Missile
	//
	// case kill) newbee killed:
	//            **Goem Funaila** flying in a **Praxis**
	//            Involved Newbees:
	//            **Goem Funaila** flying in a **Praxis** with Caldari Navy Nova Heavy Assault Missile | **Goem Funaila** flying in a **Praxis** with Caldari Navy Nova Heavy Assault Missile

	//                                                                                                             true : false
	const killmailfFieldName = (type == 'lost') ? 'newbee **' + idMap.get(package.killmail.victim.character_id) + '** lost' : 'newbee killed:';

	const flyingInAShip = 'flying in a **' + idMap.get(package.killmail.victim.ship_type_id) + '**';
	const killmailfFieldValue = (type == 'lost') ? flyingInAShip : '**' + idMap.get(package.killmail.victim.character_id) + '** ' + flyingInAShip;
	//                                                  ^   true : false

	//                                                         true : false
	const elementFieldHeader = (type == 'lost') ? 'Final Blowed by' : 'Involved Newbees:';

	const killmailEmbed = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(embedTitle)
		.setURL('https://zkillboard.com/kill/' + package.killmail.killmail_id + '/')
		.setDescription('**Location:** \n' + idMap.get(package.killmail.solar_system_id))
		.setThumbnail('https://images.evetech.net/types/' + package.killmail.victim.ship_type_id + '/render?size=128')
		.addFields(
			{ name: killmailfFieldName, value: killmailfFieldValue },
		);

	let isFristElement = true;
	for (const element of newbeeAttackerIDs) {
		let fieldName = '\u200b';

		if (isFristElement) {
			fieldName = elementFieldHeader;
			isFristElement = false;
		}

		killmailEmbed.addFields({ name: fieldName, value: '**' + idMap.get(element.character_id) + '** flying in a ' + getShipAndWeaponString(idMap.get(element.ship_type_id), idMap.get(element.weapon_type_id)), inline: true });
	}

	killmailEmbed.addFields({ name: '\u200b', value: '**Total ' + getPriceString(package.zkb.totalValue) + ' ISK**, Droped ' + getPriceString(package.zkb.droppedValue) + ' ISK, Involved: **' + package.killmail.attackers.length + '**' });

	client.channels.cache.get(process.env.DISCORD_NEWBEE_CHANNEL_ID).send({
		content: '뉴비 연관 킬메일 발생!',
		embeds: [killmailEmbed],
	});
}

function getPriceString(rawKillmailPrice) {
	if (rawKillmailPrice >= 1e9) {
		return (rawKillmailPrice / 1e9).toFixed(2) + 'B';
	}
	else if (rawKillmailPrice >= 1e6) {
		return (rawKillmailPrice / 1e6).toFixed(2) + 'M';
	}
	else {
		return rawKillmailPrice.toFixed(2);
	}
}

function getShipAndWeaponString(ship, weapon) {
	const returnString = '**' + ship + '**';

	if (ship == weapon) {
		return returnString;
	}

	return returnString + ' with ' + weapon;
}

module.exports = processKillmail;