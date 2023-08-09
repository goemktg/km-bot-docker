const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require("node-cron")
 
// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);

	client.user.setActivity('뉴비', { type: ActivityType.Watching });
});

var isJobRunning = false;

cron.schedule("*/10 * * * * *", async function () {
	if (isJobRunning)
		return;
		//console.log("running a task every 10 seconds");
		isJobRunning = true;
		// redisq zkillboard api 
		// retives one killmail at one time
		// job flow
		// 1) 10초마다 받아옴
		// 2) 킬메일 받아오기 시작. 2-1) 혹은 2-2) 로 감
		// 2-1) 킬메일 존재할 경우 꼽 아이디 확인 후 2로 돌아감
		// 2-2) 킬메일 없을 경우 1)로 돌아감 (10초 대기)
	
		var isKillmailExist = true;
		//var queue_num_debug = 0; // production 에선 코멘트
	
		while (isKillmailExist) {
			//const killboardResponse = '{"package":{"killID":110852967,"killmail":{"attackers":[{"alliance_id":99003581,"character_id":2117585878,"corporation_id":98609905,"damage_done":471,"final_blow":true,"security_status":1.6,"ship_type_id":28665,"weapon_type_id":2929}],"killmail_id":110852967,"killmail_time":"2023-08-07T18:09:20Z","solar_system_id":30000303,"victim":{"alliance_id":99007629,"character_id":2117835657,"corporation_id":98578021,"damage_taken":471,"items":[],"position":{"x":-238340018128.50443,"y":133390663016.32596,"z":218191617026.56125},"ship_type_id":670}},"zkb":{"locationID":40019048,"hash":"5a39b3d4d932770f6a25616e1f96ddd9896c6ed2","fittedValue":10000,"droppedValue":0,"destroyedValue":10000,"totalValue":10000,"points":1,"npc":false,"solo":false,"awox":false,"labels":["cat:6","#:1","pvp","loc:nullsec"],"href":"https://esi.evetech.net/v1/killmails/110852967/5a39b3d4d932770f6a25616e1f96ddd9896c6ed2/"}}}'
			//const redisqData = JSON.parse(killboardResponse);
			const killboardResponse = await fetch("https://redisq.zkillboard.com/listen.php", { method: "GET"} )
			const redisqData = await JSON.parse(await killboardResponse.text());

			if (redisqData.package == null)
				isKillmailExist = false;
			else {
				//console.log(redisqData.package);
			
				// create attacker db
				var newbeeAttackerIDs = new Array();
				var attackersIndex = 0;
				redisqData.package.killmail.attackers.forEach(obj => {
					Object.entries(obj).forEach(([key, value]) => {
						if ((key == 'corporation_id' && value == 98578021) || (key == 'final_blow' && value == true && redisqData.package.killmail.victim.corporation_id == 98578021)) {
							newbeeAttackerIDs.push(redisqData.package.killmail.attackers[attackersIndex]);
						}
					});
				})
			
				// check victim
				if (redisqData.package.killmail.victim.corporation_id == 98578021)
					pushKillmailMsg(redisqData.package, 'lost');
				// check attackers
				else if (newbeeAttackerIDs.length)
					pushKillmailMsg(redisqData.package, 'killed', newbeeAttackerIDs);
			}
		}
		
		isJobRunning = false;
	});

async function pushKillmailMsg(package, type, newbeeAttackerIDs = null) {
	// make using id as array
	var idMap = new Map();
	idMap.set(package.killmail.victim.ship_type_id, null);
	idMap.set(package.killmail.victim.character_id, null);
	idMap.set(package.killmail.solar_system_id, null);

	for (let element of newbeeAttackerIDs) {
		//console.log('element:');
		//console.log(element);
		
		idMap.set(element.character_id, null);
		idMap.set(element.ship_type_id, null);
		idMap.set(element.weapon_type_id, null);
	}
	
	const postData = JSON.stringify( Array.from(idMap.keys()) );
	//console.log('post: '+postData);

	// get name resolved
	const EsiResponse = await fetch("https://esi.evetech.net/latest/universe/names/?datasource=tranquility", { method: "POST", headers: { 'User-Agent': 'Maintainer: Goem Funaila(IG) samktg52@gmail.com' }, body: postData } )
	const EsiData = await JSON.parse(await EsiResponse.text());

	//console.log('Esi: ')
	//console.log(EsiData);

	// apply esi data
	for (let element of EsiData) {
		idMap.set(element.id, element.name);
	}
	//console.log(idMap);

	//                                      true : false
	let embedColor = (type == 'lost') ? 0xFF0000 : 0x00FFFF
	//console.log(embedColor);
	//                  Kill: Goem Funaila (Keres)
	const embedTitle = 'Kill: '+idMap.get(package.killmail.victim.character_id)+' ('+idMap.get(package.killmail.victim.ship_type_id)+')';
	//console.log(embedTitle);

	const killmailEmbed = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(embedTitle)
		.setURL('https://zkillboard.com/kill/'+package.killmail.killmail_id+'/')
		.setDescription('**Location:** \n'+idMap.get(package.killmail.solar_system_id))
		.setThumbnail('https://images.evetech.net/types/'+package.killmail.victim.ship_type_id+'/render?size=128')
		.addFields(
			{ name: 'newbee '+type+':', value: idMap.get(package.killmail.victim.character_id)+' flying in a **'+idMap.get(package.killmail.victim.ship_type_id)+'**' },
		);
	
	var isFristElement = true;
	for (let element of newbeeAttackerIDs) {
		var fieldName = '\u200b';

		if (isFristElement) {
			fieldName = 'contributers:';
			isFristElement = false;
		}

		killmailEmbed.addFields({ name: fieldName, value: idMap.get(element.character_id)+' flying in a '+idMap.get(element.ship_type_id)+' with '+idMap.get(element.weapon_type_id), inline: true })
	}

	killmailEmbed.addFields({ name: '\u200b', value: '**Total '+calcKillmailPrice(package.zkb.totalValue)+' ISK**, Droped '+calcKillmailPrice(package.zkb.droppedValue)+' ISK' });

	client.channels.cache.get('1138118432219484321').send({
		content: '뉴비 연관 킬메일 발생!',
		embeds: [killmailEmbed],
		});
}

function calcKillmailPrice(rawKillmailPrice) {
	if (rawKillmailPrice / 1000000000 >= 1) // 1b 이상
		return (rawKillmailPrice % 1000000000).toLocaleString()+'B';
	else if (rawKillmailPrice / 1000000 >= 1) // 1m 이상
		return (rawKillmailPrice % 1000000).toLocaleString()+'M';
}