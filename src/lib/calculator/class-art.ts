export type ClassArtComposition = 'standard' | 'wide' | 'tall';

export type ClassArt = {
	label: string;
	src: string;
	sourcePage: string;
	composition: ClassArtComposition;
};

const MAIN_KIT_SOURCE = 'https://www.latale.com/media/fansitekit/view/24?page=1';
const SUBCLASS_KIT_SOURCE = 'https://www.latale.com/media/fansitekit/view/25?page=1';
const DOKKAEBI_KIT_SOURCE = 'https://www.latale.com/media/fansitekit/view/26?page=1';

function art(
	label: string,
	filename: string,
	sourcePage: string,
	composition: ClassArtComposition = 'standard'
): ClassArt {
	return {
		label,
		src: `/art/classes/${filename}`,
		sourcePage,
		composition
	};
}

const hero = art('Hero', 'hero.png', MAIN_KIT_SOURCE);
const bladeMaster = art('Blade Master', 'blade-master.png', MAIN_KIT_SOURCE, 'wide');
const savior = art('Savior', 'savior.png', MAIN_KIT_SOURCE);
const archmage = art('Archmage', 'archmage.png', MAIN_KIT_SOURCE);
const popStar = art('Pop Star', 'pop-star.png', MAIN_KIT_SOURCE);
const windStalker = art('Wind Stalker', 'wind-stalker.png', MAIN_KIT_SOURCE, 'wide');
const derFreischutz = art('Der Freischütz', 'der-freischutz.png', MAIN_KIT_SOURCE, 'wide');
const swordian = art('Swordian', 'swordian.png', MAIN_KIT_SOURCE, 'wide');
const soullessOne = art('Soulless One', 'soulless-one.png', MAIN_KIT_SOURCE, 'wide');
const arcMaster = art('Arc Master', 'arc-master.png', MAIN_KIT_SOURCE);
const forceMaster = art('Force Master', 'force-master.png', MAIN_KIT_SOURCE, 'wide');
const blackAnima = art('Black Anima', 'black-anima.png', MAIN_KIT_SOURCE);
const demigod = art('Demigod', 'demigod.png', MAIN_KIT_SOURCE, 'wide');
const shadowWalker = art('Shadow Walker', 'shadow-walker.png', MAIN_KIT_SOURCE, 'wide');
const swordSaint = art('Sword Saint', 'sword-saint.png', MAIN_KIT_SOURCE);
const dokkaebi = art('Dokkaebi', 'dokkaebi.png', DOKKAEBI_KIT_SOURCE, 'tall');
const highlander = art('Highlander', 'highlander.png', SUBCLASS_KIT_SOURCE, 'wide');
const swordDancer = art('Sword Dancer', 'sword-dancer.png', SUBCLASS_KIT_SOURCE, 'wide');
const terrorKnight = art('Terror Knight', 'terror-knight.png', SUBCLASS_KIT_SOURCE, 'wide');
const psykicker = art('Psykicker', 'psykicker.png', SUBCLASS_KIT_SOURCE);
const phantomMage = art('Phantom Mage', 'phantom-mage.png', SUBCLASS_KIT_SOURCE);
const maestro = art('Maestro', 'maestro.png', SUBCLASS_KIT_SOURCE);
const rogueMaster = art('Rogue Master', 'rogue-master.png', SUBCLASS_KIT_SOURCE);
const judgment = art('Judgment', 'judgment.png', SUBCLASS_KIT_SOURCE, 'wide');
const starSeeker = art('Star Seeker', 'star-seeker.png', SUBCLASS_KIT_SOURCE, 'wide');
const jewelStar = art('Jewel Star', 'jewel-star.png', SUBCLASS_KIT_SOURCE);
const windia = art('Windia', 'windia.png', SUBCLASS_KIT_SOURCE, 'wide');
const rainia = art('Rainia', 'rainia.png', SUBCLASS_KIT_SOURCE);

export const DEFAULT_CLASS_ART = dokkaebi;

export const CLASS_ART_BY_PRESET = {
	'Hero (Greatsword)': hero,
	'Hero (Spear)': hero,
	'Blade Master': bladeMaster,
	'Savior (Sword)': savior,
	'Savior (Mace)': savior,
	Archmage: archmage,
	'Pop Star': popStar,
	'Wind Stalker (Dagger)': windStalker,
	'Wind Stalker (Bow)': windStalker,
	'Wind Stalker (Crossbow)': windStalker,
	'Der Freischütz': derFreischutz,
	Swordian: swordian,
	'Soulless One': soullessOne,
	'Arc Master': arcMaster,
	'Force Master': forceMaster,
	'Black Anima (Jade)': blackAnima,
	'Black Anima (Katana)': blackAnima,
	'Demigod (Rage)': demigod,
	'Demigod (Divine)': demigod,
	'Shadow Walker': shadowWalker,
	'Sword Saint': swordSaint,
	Dokkaebi: dokkaebi,
	Highlander: highlander,
	'Sword Dancer': swordDancer,
	'Terror Knight': terrorKnight,
	Psykicker: psykicker,
	'Phantom Mage': phantomMage,
	Maestro: maestro,
	'Rogue Master': rogueMaster,
	Judgment: judgment,
	'Star Seeker': starSeeker,
	'Jewel Star': jewelStar,
	Windia: windia,
	Rainia: rainia
} satisfies Record<string, ClassArt>;

export function getClassArt(presetName: string | null | undefined): ClassArt {
	if (!presetName) return DEFAULT_CLASS_ART;
	return CLASS_ART_BY_PRESET[presetName as keyof typeof CLASS_ART_BY_PRESET] ?? DEFAULT_CLASS_ART;
}
