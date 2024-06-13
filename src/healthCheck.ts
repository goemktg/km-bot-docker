import fs from 'fs';

const statusFile = JSON.parse(fs.readFileSync('status.json', 'utf8')) as StatusFile;
if (statusFile.status !== 'ok') {
	process.exit(1);
}
else {
	process.exit(0);
}

interface StatusFile {
	status: string;
}