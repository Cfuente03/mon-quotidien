// Configuration modifiable directement sur GitHub.
export const LOCK = {
  // Laisser vide : le mot de passe est créé à la première ouverture, sur chaque appareil.
  // Pour imposer le MÊME mot de passe partout : ouvrez ⚙️ Réglages → « Générer le code pour config.js »
  // puis collez la valeur ici, par ex. hash: '9f2c…:a81b…'
  hash: '',
  // Fréquence de demande du mot de passe : 'month' (une fois par mois), 'day' ou 'always' (à chaque ouverture)
  period: 'month',
};
