const { Client, Events, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { loadEnvironmentVariables } = require('./library/functions.js');
const cron = require('node-cron');
const axios = require('axios');

loadEnvironmentVariables();

// client 인스턴스 생성
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// discord token을 사용해 client 로그인
client.login(process.env.DISCORD_TOKEN);

// client가 준비되면 이 코드 실행 ( 한번만 실행됨 )
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);

	// 봇 상태메시지 설정
	client.user.setPresence({
		activities: [{
			type: ActivityType.Custom,
			name: 'custom',
			state: '킬보드 감시 중',
		}],
	});
});


const redisqURL = 'https://redisq.zkillboard.com/listen.php?queueID=Goem_Funaila';
console.log('getting data from:' + redisqURL);

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

async function processKillmail() {
	isJobRunning = true;
	// TODO: 요거 reamde로 옮기기
	// redisq zkillboard api
	// retives one killmail at one time
	// job flow
	// 1) 10초마다 2) 실행
	// 2) 이미 3) 단계가 진행 중인경우 스킵, 아니라면 3)으로 감
	// 3) 데이터 받아옴. null값 반환될 경우 (받아올 킬메일 없음) 스킵. 아니면 4)로 감
	// 4) 해당 킬메일 처리 후 3로 돌아감

	let isKillmailExist = true;

	while (isKillmailExist) {
		const redisqData = await axios.get(redisqURL)
			.then(response => response.data);

		if (redisqData.package == null) {
			console.log('no killmail returned. skip killmail process.');
			isKillmailExist = false;
		}
		else {

			console.log('processed: ' + redisqData.package.killID);

			const newbeeAttackerIDs = new Array();
			const oldbeeAttackerIDs = new Array();
			for (const element of redisqData.package.killmail.attackers) {

				if (element.corporation_id == 98578021 || (element.final_blow == true && redisqData.package.killmail.victim.corporation_id == 98578021)) {
					newbeeAttackerIDs.push(element);
				}

				if (element.alliance_id == 99010412 && redisqData.package.zkb.totalValue >= 100000000) {
					oldbeeAttackerIDs.push(element);
				}
			}

			// check victim
			if (redisqData.package.killmail.victim.corporation_id == 98578021) {
				pushKillmailMsg(redisqData.package, 'lost', newbeeAttackerIDs);
			}
			// check attackers
			else if (newbeeAttackerIDs.length) {
				pushKillmailMsg(redisqData.package, 'kill', newbeeAttackerIDs);
			}

			// check alliance kill
			if (oldbeeAttackerIDs.length) {
				client.channels.cache.get(process.env.DISCORD_KM_POST_CHANNEL_ID).send('https://zkillboard.com/kill/' + redisqData.package.killID + '/');
			}
		}
	}

	isJobRunning = false;
}

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


// TODO: getPriceString 함수와 getFormatedNumString 함수를 통합할 수 있을 것 같음
function getPriceString(rawKillmailPrice) {
	let returnString = '';

	if (rawKillmailPrice >= 1000000000) {
		// 1b 이상
		returnString = getFormatedNumString(rawKillmailPrice / 1000000000) + 'B';
	}
	else if (rawKillmailPrice >= 1000000) {
		// 1m 이상
		returnString = getFormatedNumString(rawKillmailPrice / 1000000) + 'M';
	}
	else {
		returnString = getFormatedNumString(rawKillmailPrice);
	}

	return returnString;
}

function getFormatedNumString(float) {
	return (Math.floor(float * 100) / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function getShipAndWeaponString(ship, weapon) {
	const returnString = '**' + ship + '**';

	if (ship == weapon) {
		return returnString;
	}

	return returnString + ' with ' + weapon;
}