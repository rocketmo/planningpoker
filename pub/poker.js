var _vm = function() {
    this.socket = null;

    this.voteCardValues = [0, 0.5, 1, 2, 3, 5, 8, 13];
    this.isResetting = ko.observable(false);
    this.isRevealed = ko.observable(false);

    this.joinRoomName = ko.observable();
    this.joinRoomText = ko.computed(function() {
        if (this.joinRoomName()) {
            return 'Join ' + this.joinRoomName();
        } else {
            return 'Join Existing...';
        }
    }, this);

    // every user { id, name, vote() }
    this.users = ko.observableArray();
    this.allVoted = ko.computed(function() {
        if (this.users().length == 0) {
            return false;
        }
        var ret = true;
        this.users().forEach(user => {
            if (user && user.vote() === undefined) {
                ret = false;
            }
        });

        if (ret) {
            this.addRandomCardAngles();
        }
        return ret && !this.isResetting();
    }, this);

    this.userName = ko.observable();
    this.userId = ko.observable();
    this.roomName = ko.observable();

    this.userNameLoaderVisible = ko.observable(false);
    this.loginBoxVisible = ko.observable(true);
    this.socketPreloaderVisible = ko.observable(true);

    this.onAfterLogin = function() {  };
    this.userId.subscribe(function() {
        this.onAfterLogin();
    }, this);

    // convert .vote to observable
    this.prepareUserData = function(users) {
        function prepare(data) {
            if (!data.vote || !ko.isObservable(data.vote)) {
                data.vote = ko.observable(data.vote);
            }
        }
        if (users instanceof Array) {
            users.forEach(user => {
                prepare(user);
            });
        } else {
            prepare(users);
        }
        return users;
    }

    this.init = function() {
        // replace it with another loader?
        this.prepareSocket(() => {
            this.socketPreloaderVisible(false);

            // Handle hash deeplinking
            if (this.hasRoomInUrl()) {
                this.joinRoomName(this.getRoomNameFromUrl());
            }

            // TODO: Trigger focus on the input field
            this.focusOnLoad();
        });
    };

    this.prepareSocket = function(callback) {
        this.socket = io.connect();
        this.socket.on('connect', function() {
            callback && callback();
        });

        this.socket.on('hello', data => {
            console.log('hello', data.id);
            this.userId(data.id);
        });

        this.socket.on('server_error', data => {
            alert('Server returned error: ' + data.msg);
            this.userNameLoaderVisible(false);

            // Special handling:
            // - if extra data includes a room name, remove from view model
            if (data.roomName) {
                this.resetUrl();
                this.joinRoomName(undefined);
            }
        });

        this.socket.on('error', function(data) {
            console.log('socket error:', data);
        });

        this.socket.on('welcome', data => {
            console.log('welcome', data);
            this.roomName(data.roomName);
            this.users(this.prepareUserData(data.users));
            this.userNameLoaderVisible(false);
            this.loginBoxVisible(false);
        });

        this.socket.on('joined', data => {
            // add the room name to the URL for easy room sharing
            this.updateUrlWithRoom(this.roomName());

            // skip ourselves
            if (data.id == this.userId()) {
                return;
            }

            this.users.push(this.prepareUserData(data));
        });

        this.socket.on('user_voted', data => {
            // catch voted user and set 'vote' field
            this.users().forEach(user => {
                if (user.id == data.id) {
                    user.vote(data.vote);
                }
            });
        });

        this.socket.on('reset', () => {
            // don't delay if all votes aren't tallied
            const timeoutLength = this.allVoted() || this.isRevealed() ? 500 : 0;

            if (!!this._reset) {
                clearTimeout(this._reset);
                this._reset = null;
                return;
            }

            // set resetting to true for a bit before removing scores
            // to handle card flip animation
            this.isResetting(true);
            this.isRevealed(false);

            this._reset = setTimeout(() => {
                this.users().forEach(user => {
                    user && user.vote(undefined);
                });

                this.isResetting(false);

                this.removeCardAngles();

                this._reset = null;
            }, timeoutLength);
        });

        this.socket.on('reveal', () => {
            this.isRevealed(true);
        });

        this._reset = null;

        this.socket.on('quit', data => {
            // remove user from list
            console.log('remove user', data);
            this.users(
                this.users().filter(user => user && user.id !== data.id)
            );
        });
    }

    this.login = function() {
        this.userName(this.userName().trim());
        if (!/^[a-z0-9-_]+$/i.test(this.userName())) {
            return alert('Username must be [a-z0-9-_\.]+');
        }
        this.userNameLoaderVisible(true);
        if (!this.userId()) {
            this.socket.emit('set_name', { name: this.userName() });
        } else {
            this.userId.valueHasMutated();
        }
    }

    this.resetRoom = function() {
        this.socket.emit('reset', { roomName: this.roomName() });
    }

    this.revealVotes = function() {
        this.socket.emit('reveal', { roomName: this.roomName() });
    }

    // dom elements listeners
    this.onEnterClick = function() {
        var rn = this.joinRoomName() || prompt("Enter room name");
        if (!rn || /^\s*$/.test(rn)) {
            return;
        }
        this.onAfterLogin = () => {
            this.socket.emit('join', {roomName: rn});
        };
        this.login();
        // see this.userId.subsribe to follow up next steps
    }

    this.onCreateRoomClick = function() {
        this.onAfterLogin = () => {
            this.socket.emit('join');
        };
        this.login();
        // see this.userId.subsribe to follow up next steps
    }

    this.onClickRoomNumber = function() {
        this.copyShareableUrl();
    }

    this.onVoteCardClick = function(vote) {
        vm.socket.emit('vote', { roomName: vm.roomName(), vote: vote });
    }

    // URL handling - @TODO: chop into separate module
    this.updateUrlWithRoom = function(toRoom) {
        window.location = '#' + toRoom;
    };

    this.resetUrl = function() {
        window.location = '';
    };

    this.copyShareableUrl = function(cb) {
        window.navigator.clipboard.writeText(window.location);
        cb && cb();
    };

    this.hasRoomInUrl = function() {
        return !!document.location.hash.slice(0,4);
    }

    this.getRoomNameFromUrl = function() {
        return document.location.hash.split('#')[1].slice(0,3);
    }

    // adv. DOM functions and animations
    this.removeCardAngles = function() {
        // clear the nudges - since knockout doesn't do css vars, have to go thru DOM methods
        document.querySelectorAll('.user.card').forEach(card => {
            card.style.setProperty('--card-angle', '');
        });
    };

    this.addRandomCardAngles = function() {
        // give it a nudge - since knockout doesn't do css vars, have to go thru DOM methods
        document.querySelectorAll('.user.card').forEach(card => {
            if (!card.style.getPropertyValue('--card-angle')) {
                const newCardAngle = (Math.round((Math.random() * 8) - 4)) + 'deg';
                card.style.setProperty('--card-angle', newCardAngle);
            }
        });
    };

    this.focusOnLoad = function() {
        document.querySelector('input').focus();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    ko.applyBindings(window.vm = new _vm());
    vm.init();
    console.log('%cAPP READY', 'color: green');
});
