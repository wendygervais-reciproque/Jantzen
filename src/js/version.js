// Remplace par ton pseudo GitHub et le nom de ton dépôt
const USERNAME = 'wendygervais-reciproque';
const REPO = 'Jantzen';
const BRANCH = 'dev'; // Remplace par 'master' si ta branche principale s'appelle master

async function displayLastPushDate() {
  const titleElement = document.getElementById('last-update');
  if (!titleElement) return;

  try {
    const response = await fetch(`https://api.github.com/repos/${USERNAME}/${REPO}/commits/${BRANCH}`);
    
    if (!response.ok) {
      throw new Error(`Erreur GitHub: ${response.status}`);
    }

    const data = await response.json();
    const commitDate = new Date(data.commit.committer.date);

    // Formatage de la date : "24/07/2026 à 11:35"
    const formattedDate = commitDate.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    titleElement.textContent = `Version : ${formattedDate.replace(':', 'h')}`;
  } catch (error) {
    console.error('Impossible de récupérer le dernier push :', error);
    // Texte de secours en cas de problème réseau ou repo privé
    titleElement.textContent = 'Mon Prototype';
  }
}

// On lance la fonction une fois le document chargé
document.addEventListener('DOMContentLoaded', displayLastPushDate);