FROM balenalib/rpi-raspbian

RUN install_packages wget \
    xserver-xorg-video-fbdev \
    xserver-xorg xinit \
    xterm x11-xserver-utils \
    xterm \
    xserver-xorg-input-evdev \
    xserver-xorg-legacy \
    mesa-vdpau-drivers \
    chromium-browser \
    rpi-chromium-mods \ 
    libgles2-mesa \
    lsb-release

# Setting working directory
WORKDIR /usr/src/app

COPY ../start.sh ./


ENV UDEV=1

# Add chromium user
RUN useradd chromium -m -s /bin/bash -G root && \
    groupadd -r -f chromium && id -u chromium \
    && chown -R chromium:chromium /home/chromium

COPY ../public-html /home/chromium  

# udev rule to set specific permissions 
RUN echo 'SUBSYSTEM=="vchiq",GROUP="video",MODE="0660"' > /etc/udev/rules.d/10-vchiq-permissions.rules
RUN usermod -a -G audio,video,tty chromium

ENTRYPOINT ["bash", "start.sh"]
CMD ["export DISPLAY=:0"]