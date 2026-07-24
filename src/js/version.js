async function displayLastPushDate() {
  const titleElement = document.getElementById('last-update');
  if (!titleElement) return;

  try {
    const response = await fetch('/version.json');
    
    // Si version.json n'existe pas encore (ex: en local)
    if (!response.ok) {
      titleElement.textContent = "Version 24/07 12:00";  // Valeur par défaut
      return;
    }

    const data = await response.json();
    const commitDate = new Date(data.lastPush);

    const formattedDate = commitDate.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    titleElement.textContent = `Dernier push : ${formattedDate.replace(':', 'h')}`;
  } catch (error) {
    // En cas d'autre erreur, on met un titre propre sans bloquer
    titleElement.textContent = "Mon Prototype";
  }
}

document.addEventListener('DOMContentLoaded', displayLastPushDate);