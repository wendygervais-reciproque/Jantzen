async function displayLastPushDate() {
  const titleElement = document.getElementById('last-update');
  if (!titleElement) return;

  try {
    // On lit le fichier local généré par GitHub Actions
    const response = await fetch('.src/js/version.json');
    if (!response.ok) throw new Error('Fichier version.json introuvable');

    const data = await response.json();
    const commitDate = new Date(data.lastPush);

    // Formatage en français
    const formattedDate = commitDate.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    titleElement.textContent = `Dernier push : ${formattedDate.replace(':', 'h')}`;
  } catch (error) {
    console.error(error);
    titleElement.textContent = 'Mon Prototype';
  }
}

document.addEventListener('DOMContentLoaded', displayLastPushDate);