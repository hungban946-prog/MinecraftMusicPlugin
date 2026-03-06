package me.hung.music;

import org.bukkit.Bukkit;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

public class MusicPlugin extends JavaPlugin {

    @Override
    public void onEnable() {
        Bukkit.getScheduler().runTaskTimer(this, () -> {
            for (Player p : Bukkit.getOnlinePlayers()) {
                if (p.getWorld().getName().equalsIgnoreCase("lobby")) {
                    p.playSound(p.getLocation(), Sound.MUSIC_DISC_CAT, 1f, 1f);
                }
            }
        }, 0L, 200L);
    }
}
