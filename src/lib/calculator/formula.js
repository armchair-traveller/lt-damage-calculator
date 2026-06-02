export function applyChanges(stats, changes){
  let rawStats = {};
  let rawMults = {};
  let changedStats = {};

  for (let s in stats) {
    rawStats[s] = stats[s][0] / (stats[s][1] / 100 + 1);
    rawMults[s] = stats[s][1];
  }

  for (let s in changes) {
    rawStats[s] += changes[s][0]
    rawMults[s] += changes[s][1]
  };
  
  for (let s in rawStats) {
    changedStats[s] = [rawStats[s] * (rawMults[s] / 100 + 1), rawMults[s]]
  };

  return changedStats;
}

export function calculateDamage(stats, settings, defenses, enemyType) {
  // bases
  const attack = stats.attack[0] * settings.aF / 50 * defenses[enemyType].multiplier;
  const strength = stats.strength[0] * ((settings.sF * settings.summonWeight + (stats.ratio[0] + 100) * (1 - settings.summonWeight)) / 100) * defenses[enemyType].multiplier;
  const staticDamage = stats.static[0] * defenses[enemyType].multiplier;
  const added = stats[enemyType + 'Added'][0] * defenses[enemyType].multiplier;

  const base = attack + (strength + staticDamage + added - defenses[enemyType].flat);

  // multipliers
  const abnormal = enemyType === 'normal' ? 1 : 0 // negate abnormal vs bosses, can't status them
  const critical = (stats.critical[0] * (1 - defenses[enemyType].phasing) + 100 + (stats.back[0] + stats.melee[0] + stats.abnormal[0] * abnormal) * settings.backWeight) / 100;
  const min = stats.minimum[0] <= stats.maximum[0] ? stats.minimum[0] : stats.maximum[0]
  const minmax = (min * settings.minWeight + stats.maximum[0] * (1 - settings.minWeight) + 100) / 100;
  const amp = stats[enemyType + 'Amp'][0] <= 100 ? 1 + stats[enemyType + 'Amp'][0] / 100 : 2;

  const multiplier = critical * minmax * amp;

  const resultingDamage = base * multiplier * (settings.fF / 100) * (1 - defenses[enemyType].mitigation);

  return resultingDamage;
};

export function compareDamage(oldDamage, newDamage) {
  return (newDamage - oldDamage) / oldDamage;
};

export function getAverageDamage(normalDamage, bossDamage, weight) {
  return normalDamage * (1-weight) + bossDamage * weight;
};

export function calculateEquivalenceIncrease(stats, settings, defenses, increasePercent) {
  // use the damage formulas to solve for this equation:
  // (newDamageNormal - oldDamageNormal) / oldDamageNormal * (1-bossWeight) + (newDamageBoss - oldDamageBoss) / oldDamageBoss * bossWeight = increasePercent
  // newDamage = stat to be increased's multipliers * increase + old damage, solve for increase
  // work the damage formula backwards to solve for each stat with the other provided stats and the increasePercent
  // due to the large amount of variables, the equations are very long so some auxiliary variables are used
  const strP = stats.strength[1]/100+1;
  const atkP = stats.attack[1]/100+1;
  const statP = stats.static[1]/100+1;
  const nAddP = stats.normalAdded[1]/100+1;
  const bAddP = stats.bossAdded[1]/100+1;
  const critP = stats.critical[1]/100+1;
  const minP = stats.minimum[1]/100+1;
  const maxP = stats.maximum[1]/100+1;

  const str = stats.strength[0] / strP;
  const atk = stats.attack[0] / atkP;
  const stat = stats.static[0] / statP;
  const nAdd = stats.normalAdded[0] / nAddP;
  const bAdd = stats.bossAdded[0] / bAddP;
  const crit = stats.critical[0] / critP;
  const min = stats.minimum[0] <= stats.maximum[0] ? stats.minimum[0] / minP : stats.maximum[0] / maxP;
  const max = stats.maximum[0] / maxP;
  const nAmp = stats.normalAmp[0];
  const bAmp = stats.bossAmp[0];
  const rat = stats.ratio[0];
  const back = stats.back[0];
  const mel = stats.melee[0];
  const abn = stats.abnormal[0];

  const minW = settings.minWeight;
  const bossW = settings.bossWeight;
  const sumW = settings.summonWeight;
  const backW = settings.backWeight;
  const sF = (settings.sF*sumW + (rat+100)*(1-sumW)) / 100;
  const aF = settings.aF / 50;
  const tF = settings.fF / 100;
  
  const nDefFlat = defenses.normal.flat;
  const nDefMult = defenses.normal.multiplier;
  const nDefMit = 1 - defenses.normal.mitigation;
  const nDefPha = defenses.normal.phasing
  const bDefFlat = defenses.boss.flat;
  const bDefMult = defenses.boss.multiplier;
  const bDefMit = 1 - defenses.boss.mitigation;
  const bDefPha = defenses.boss.phasing

  const r = increasePercent;

  const nDmg = calculateDamage(stats, settings, defenses, "normal")
  const bDmg = calculateDamage(stats, settings, defenses, "boss")

  const nCritCalc = ((crit*critP*(1-nDefPha)+(back+mel+abn)*backW)/100+1)
  const bCritCalc = ((crit*critP*(1-bDefPha)+(back+mel+abn)*backW)/100+1)
  const minMaxCalc = (min*minP*minW/100+max*maxP*(1-minW)/100+1)
  const nAmpCalc = (nAmp/100+1)
  const bAmpCalc = (bAmp/100+1)

  const nBase = ((str*strP*sF+atk*atkP*aF+stat*statP+nAdd*nAddP)*nDefMult-nDefFlat)*nDefMit*tF
  const bBase = ((str*strP*sF+atk*atkP*aF+stat*statP+bAdd*bAddP)*bDefMult-bDefFlat)*bDefMit*tF
  const nMultis = nDefMult*nCritCalc*minMaxCalc*nAmpCalc*nDefMit*tF
  const bMultis = bDefMult*bCritCalc*minMaxCalc*bAmpCalc*bDefMit*tF

  // console.log(sF)

  let equivalence = {};

  // console.log(nBase*(critP*(1-nDefPha)/100)*minMaxCalc*nAmpCalc/nDmg*(1-bossW))
  // console.log(bBase*(critP*(1-bDefPha)/100)*minMaxCalc*bAmpCalc/bDmg*bossW)
  // console.log(nBase*(critP*(1-nDefPha)/100)*minMaxCalc*nAmpCalc/nDmg*(1-bossW)+bBase*(critP*(1-bDefPha)/100)*minMaxCalc*bAmpCalc/bDmg*bossW)

  // console.log(nBase + ' | ' + bBase)
  // console.log(nAmpCalc + ' | ' + bAmpCalc)
  // console.log(nDmg + ' | ' + bDmg)
  // console.log(r)

  equivalence.strength = [r/(sF*strP*nMultis/nDmg*(1-bossW)+sF*strP*bMultis/bDmg*bossW), r/(sF*str*nMultis/nDmg*(1-bossW)+sF*str*bMultis/bDmg*bossW) * 100];
  equivalence.attack = [r/(aF*atkP*nMultis/nDmg*(1-bossW)+aF*atkP*bMultis/bDmg*bossW), r/(aF*atk*nMultis/nDmg*(1-bossW)+aF*atk*bMultis/bDmg*bossW) * 100];
  equivalence.static = [r/(statP*nMultis/nDmg*(1-bossW)+statP*bMultis/bDmg*bossW), r/(stat*nMultis/nDmg*(1-bossW)+stat*bMultis/bDmg*bossW) * 100];
  equivalence.critical = [
    r/(nBase*(critP*(1-nDefPha)/100)*minMaxCalc*nAmpCalc/nDmg*(1-bossW)+bBase*(critP*(1-bDefPha)/100)*minMaxCalc*bAmpCalc/bDmg*bossW),
    r/(nBase*(crit*(1-nDefPha)/100)*minMaxCalc*nAmpCalc/nDmg*(1-bossW)+bBase*(crit*(1-bDefPha)/100)*minMaxCalc*bAmpCalc/bDmg*bossW) * 100];
  if (settings.minWeight <= 0) {
    equivalence.minimum = ['-', '-'];
  } else {
    equivalence.minimum = [
      r/(nBase*nCritCalc*(minP*minW/100)*nAmpCalc/nDmg*(1-bossW)+bBase*bCritCalc*(minP*minW/100)*bAmpCalc/bDmg*bossW),
      r/(nBase*nCritCalc*(min*minW/100)*nAmpCalc/nDmg*(1-bossW)+bBase*bCritCalc*(min*minW/100)*bAmpCalc/bDmg*bossW) * 100];
  };
  equivalence.maximum = [
    r/(nBase*nCritCalc*(maxP*(1-minW)/100)*nAmpCalc/nDmg*(1-bossW)+bBase*bCritCalc*(maxP*(1-minW)/100)*bAmpCalc/bDmg*bossW),
    r/(nBase*nCritCalc*(max*(1-minW)/100)*nAmpCalc/nDmg*(1-bossW)+bBase*bCritCalc*(max*(1-minW)/100)*bAmpCalc/bDmg*bossW) * 100];
  if (settings.bossWeight >= 1) {
    equivalence.normalAdded = ['-', '-'];
    equivalence.normalAmp = ['-', '-'];
  } else {
    equivalence.normalAdded = [r/(nAddP*nMultis/nDmg*(1-bossW)), r/(nAdd*nMultis/nDmg*(1-bossW)) * 100];
    equivalence.normalAmp = [r/(nBase*nCritCalc*minMaxCalc/nDmg)*100*2, 'N/A'];
  }
  if (settings.bossWeight <= 0) {
    equivalence.bossAdded = ['-', '-'];
    equivalence.bossAmp = ['-', '-'];
  } else {
    equivalence.bossAdded = [r/(bAddP*bMultis/bDmg*bossW), r/(bAdd*bMultis/bDmg*bossW) * 100];
    equivalence.bossAmp = [r/(bBase*bCritCalc*minMaxCalc/bDmg)*100*2, 'N/A']
  }
  if (settings.summonWeight >= 1) {
    equivalence.ratio = ['-', '-']
  } else {
    equivalence.ratio = [r/((1-sumW)*str*strP*nMultis/nDmg*(1-bossW)+(1-sumW)*str*strP*bMultis/bDmg*bossW)*100, 'N/A']
  }
  if (settings.backWeight <= 0) {
    equivalence.back = ['-', '-']
    equivalence.melee = ['-', '-']
    equivalence.abnormal = ['-', '-']
  } else {
    equivalence.back = [
      r/(nBase*backW/100*minMaxCalc*nAmpCalc/nDmg*(1-bossW)+bBase*backW/100*minMaxCalc*bAmpCalc/bDmg*bossW),
      'N/A']
    equivalence.melee = [
      r/(nBase*backW/100*minMaxCalc*nAmpCalc/nDmg*(1-bossW)+bBase*backW/100*minMaxCalc*bAmpCalc/bDmg*bossW),
      'N/A']
    equivalence.abnormal = [
      r/(nBase*backW/100*minMaxCalc*nAmpCalc/nDmg*(1-bossW)),
      'N/A']
  }

  return equivalence;
};